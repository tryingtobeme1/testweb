from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import os
import time
from collections import Counter
from webdriver_manager.chrome import ChromeDriverManager
import re

# Flask Application
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

def print_status(message):
    """Print status messages in a consistent format"""
    print(f"[STATUS] {message}")

class BrowserHandler:
    """
    Class to handle Chrome browser setup and teardown to reduce duplication.
    """
    def __init__(self, headless=True):
        chrome_options = Options()
        if headless:
            chrome_options.add_argument("--headless")
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option("useAutomationExtension", False)
        
        # Add Chrome binary location for server environment
        chrome_options.binary_location = "/opt/render/project/.render/chrome"
        chromedriver_path = "/opt/render/project/chromedriver"

        try:
            self.driver = webdriver.Chrome(
                service=Service(chromedriver_path),
                options=chrome_options
            )
            print_status("Browser initialized successfully.")
        except Exception as e:
            print_status(f"Failed to initialize browser: {str(e)}")
            raise

    def get_driver(self):
        return self.driver

    def close(self):
        try:
            if self.driver:
                self.driver.quit()
                print_status("Browser closed successfully.")
        except Exception as e:
            print_status(f"Error while closing the driver: {str(e)}")

class KennyUPullScraper:
    def __init__(self, location, make=None, model=None, year=None):
        print_status(f"Initializing browser for {location}...")
        self.location = location
        self.browser_handler = BrowserHandler()
        self.driver = self.browser_handler.get_driver()

        base_url = "https://kennyupull.com/auto-parts/our-inventory/?branch%5B%5D={branch_id}&nb_items=42&sort=date"
        make_filter = f"&input-select-brand-1621770108-auto-parts={make}" if make else ""
        model_filter = f"&input-select-model-661410576-auto-parts={model}" if model else ""
        year_filter = f"&input-select-model_year-443917684-auto-parts={year}" if year else ""

        self.url = base_url + make_filter + model_filter + year_filter
        self.urls = {
            'Ottawa': self.url.format(branch_id='1457192'),
            'Gatineau': self.url.format(branch_id='1457182'),
            'Cornwall': self.url.format(branch_id='1576848')
        }

    def handle_cookies(self):
        print_status("Looking for cookie consent button...")
        time.sleep(5)
        try:
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for button in buttons:
                if "accept" in button.text.lower():
                    button.click()
                    print_status("Clicked accept cookies button")
                    time.sleep(2)
                    return True
            return False
        except Exception as e:
            print_status(f"Error handling cookies: {str(e)}")
            return False

    def scroll_to_load(self, pause_time=2):
        print_status("Scrolling to load more content...")
        for _ in range(3):
            try:
                last_height = self.driver.execute_script("return document.body.scrollHeight")
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(pause_time)
                new_height = self.driver.execute_script("return document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height
            except Exception as e:
                print_status(f"Error during scrolling: {str(e)}")
                continue
        print_status("Scrolling completed.")

    def scrape_page(self):
        print_status(f"Starting scrape for {self.location}...")

        try:
            self.driver.get(self.urls[self.location])
            print_status("Page loaded")

            time.sleep(5)
            self.handle_cookies()

            self.scroll_to_load(pause_time=3)
            time.sleep(2)
            self.scroll_to_load(pause_time=3)

            print_status("Waiting for car listings to load...")
            WebDriverWait(self.driver, 20).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, "img[data-src]"))
            )

            time.sleep(3)

            car_elements = self.driver.find_elements(By.CSS_SELECTOR, "img[data-src]")
            print_status(f"Found {len(car_elements)} potential car listings")

            inventory = []
            for idx, car_element in enumerate(car_elements, 1):
                try:
                    title = car_element.get_attribute("alt")
                    image_url = car_element.get_attribute("data-src")
                    parent_element = car_element.find_element(By.XPATH, "../..")
                    detail_url = parent_element.find_element(By.TAG_NAME, "a").get_attribute("href")

                    try:
                        date_listed = parent_element.find_element(By.CLASS_NAME, "infos--date").text
                    except:
                        try:
                            date_listed = parent_element.find_elements(By.CLASS_NAME, "info")[-1].text
                        except:
                            date_listed = "N/A"

                    try:
                        row_info = parent_element.find_element(By.XPATH, ".//p[@class='date info']").text
                    except:
                        row_info = "N/A"

                    if title:
                        car = {
                            'title': title,
                            'image_url': image_url,
                            'detail_url': detail_url,
                            'branch': self.location,
                            'date_listed': date_listed,
                            'row': row_info
                        }
                        inventory.append(car)
                        print_status(f"Added car {idx}: {car['title']}")
                except Exception as e:
                    print_status(f"Error processing car {idx}: {str(e)}")
                    continue

            print_status(f"Successfully scraped {len(inventory)} vehicles from {self.location}")
            return inventory

        except Exception as e:
            print_status(f"Error during scraping: {str(e)}")
            return []

    def close(self):
        self.browser_handler.close()

class EbayScraper:
    def __init__(self):
        print_status("Initializing browser for eBay scraping...")
        self.browser_handler = BrowserHandler()
        self.driver = self.browser_handler.get_driver()

    def scrape_sold_items(self, vehicle_title, min_price=150, max_price=600):
        print_status(f"Starting eBay scrape for vehicle: {vehicle_title} with price range ${min_price} - ${max_price}...")
        try:
            base_url = "https://www.ebay.com/sch/i.html?_nkw={vehicle}&_sacat=0&LH_Sold=1&LH_Complete=1&LH_ItemCondition=4&_ipg=120&rt=nc"
            min_price_filter = f"&_udlo={min_price}" if min_price else ""
            max_price_filter = f"&_udhi={max_price}" if max_price else ""
            search_url = base_url.format(vehicle=vehicle_title.replace(' ', '+')) + min_price_filter + max_price_filter

            self.driver.get(search_url)
            print_status(f"Navigated to eBay search page for {vehicle_title}")

            WebDriverWait(self.driver, 20).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, "li.s-item"))
            )
            time.sleep(3)

            items = self.driver.find_elements(By.CSS_SELECTOR, "li.s-item")
            sold_items = []
            for idx, item in enumerate(items, 1):
                try:
                    try:
                        title = item.find_element(By.CSS_SELECTOR, "h3.s-item__title").text
                    except:
                        title = item.find_element(By.CSS_SELECTOR, "div.s-item__info a").text

                    try:
                        price = item.find_element(By.CSS_SELECTOR, ".s-item__price").text
                        price_value = float(re.sub(r'[^0-9.]', '', price))
                    except:
                        price_value = 0.0

                    try:
                        thumbnail_url = item.find_element(By.CSS_SELECTOR, "img.s-item__image-img").get_attribute("src")
                        listing_url = item.find_element(By.CSS_SELECTOR, "a.s-item__link").get_attribute("href")
                    except:
                        thumbnail_url = ""
                        listing_url = ""

                    if 150 <= price_value <= 600:
                        sold_items.append({
                            'item_name': title,
                            'sold_price': price_value,
                            'thumbnail_url': thumbnail_url,
                            'listing_url': listing_url
                        })
                        print_status(f"Added sold item {idx}: {title} for ${price_value}")
                    else:
                        print_status(f"Skipped item {idx}: {title} with price ${price_value} (out of range)")
                except Exception as e:
                    print_status(f"Error processing eBay item {idx}: {str(e)}")
                    continue

            item_counter = Counter([item['item_name'] for item in sold_items])
            analysis = []
            for item_name, frequency in item_counter.items():
                total_price = sum(item['sold_price'] for item in sold_items if item['item_name'] == item_name)
                average_price = total_price / frequency
                analysis.append({
                    'item_name': item_name,
                    'average_price': average_price,
                    'frequency': frequency
                })

            return {'sold_items': sold_items, 'analysis': analysis}
        except Exception as e:
            print_status(f"Error during eBay scraping: {str(e)}")
            return {'error': str(e)}
        finally:
            self.close()

    def close(self):
        self.browser_handler.close()

@app.route('/')
def home():
    """Render the main page"""
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search():
    make = request.form.get('make', '').strip()
    model = request.form.get('model', '').strip()
    year = request.form.get('year', '').strip()
    location = request.form.get('location', '').strip()

    vehicles = [
        {'
