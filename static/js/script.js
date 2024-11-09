document.addEventListener('DOMContentLoaded', () => {
    // Add Chart.js to the page
    const chartScript = document.createElement('script');
    chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    document.head.appendChild(chartScript);

    const searchButton = document.getElementById('search-button');
    const ottawaButton = document.getElementById('ottawa-button');
    const cornwallButton = document.getElementById('cornwall-button');
    const gatineauButton = document.getElementById('gatineau-button');
    const allLocationsButton = document.getElementById('all-locations-button');
    const resultsContainer = document.getElementById('results');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.classList.add('loading');
    loadingIndicator.textContent = 'Loading...';

    let originalVehiclesData = [];

    function calculateStats(analysisData) {
        return {
            minPrice: Math.min(...analysisData.map(item => item.average_price)),
            maxPrice: Math.max(...analysisData.map(item => item.average_price)),
            totalListings: analysisData.reduce((sum, item) => sum + item.frequency, 0),
            dateRange: {
                start: analysisData[0]?.date_range?.start || 'N/A',
                end: analysisData[0]?.date_range?.end || 'N/A'
            }
        };
    }

    function createPriceChart(analysisData, containerId) {
        // Wait for Chart.js to load
        if (typeof Chart === 'undefined') {
            setTimeout(() => createPriceChart(analysisData, containerId), 100);
            return;
        }

        const ctx = document.getElementById(containerId).getContext('2d');
        const priceRanges = createPriceRanges(analysisData);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: priceRanges.map(range => `$${range.min}-$${range.max}`),
                datasets: [{
                    label: 'Number of Listings',
                    data: priceRanges.map(range => range.count),
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Price Distribution'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Listings'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Price Range'
                        }
                    }
                }
            }
        });
    }

    function createPriceRanges(analysisData) {
        const prices = analysisData.map(item => item.average_price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const rangeSize = (max - min) / 10; // Create 10 ranges

        const ranges = Array.from({ length: 10 }, (_, i) => ({
            min: Math.round(min + (i * rangeSize)),
            max: Math.round(min + ((i + 1) * rangeSize)),
            count: 0
        }));

        analysisData.forEach(item => {
            const rangeIndex = Math.min(
                Math.floor((item.average_price - min) / rangeSize),
                ranges.length - 1
            );
            ranges[rangeIndex].count += item.frequency;
        });

        return ranges;
    }

    function sortByProperty(array, property, isAscending = true) {
        return array.sort((a, b) => {
            let valueA = property === 'average_price' ? parseFloat(a[property]) : a[property];
            let valueB = property === 'average_price' ? parseFloat(b[property]) : b[property];
            
            if (valueA < valueB) return isAscending ? -1 : 1;
            if (valueA > valueB) return isAscending ? 1 : -1;
            return 0;
        });
    }

    function createEbaySearchUrl(vehicleTitle) {
        const searchQuery = vehicleTitle
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, '+')
            .trim();
        
        const ebayUrl = new URL('https://www.ebay.com/sch/i.html');
        
        const params = {
            '_nkw': searchQuery,
            '_sacat': '6000',
            'LH_Sold': '1',
            'LH_Complete': '1',
            '_udlo': '150',
            '_udhi': '600',
            'rt': 'nc',
            'LH_ItemCondition': '4',
            '_ipg': '240'
        };
        
        Object.entries(params).forEach(([key, value]) => {
            ebayUrl.searchParams.append(key, value);
        });
        
        return ebayUrl.toString();
    }

    function displayAnalysisTable(analysisData, vehicleTitle) {
        const resultsContainer = document.getElementById('results');
        const stats = calculateStats(analysisData);
        
        const analysisContainer = document.createElement('div');
        analysisContainer.className = 'analysis-container';

        const chartId = 'priceDistributionChart';

        analysisContainer.innerHTML = `
            <div class="analysis-header">
                <button class="back-to-results-btn">← Back to Results</button>
                <h2>Price Analysis for ${vehicleTitle}</h2>
            </div>
            <div class="stats-summary">
                <div class="stat-item">
                    <span class="stat-label">Price Range:</span>
                    <span class="stat-value">$${stats.minPrice.toFixed(2)} - $${stats.maxPrice.toFixed(2)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Listings:</span>
                    <span class="stat-value">${stats.totalListings}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Date Range:</span>
                    <span class="stat-value">${stats.dateRange.start} - ${stats.dateRange.end}</span>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="${chartId}"></canvas>
            </div>
            <table class="analysis-table">
                <thead>
                    <tr>
                        <th data-sort="item_name">
                            Item Name <span class="sort-icon">↕</span>
                        </th>
                        <th data-sort="average_price">
                            Average Price <span class="sort-icon">↕</span>
                        </th>
                        <th data-sort="frequency">
                            Frequency <br><span class="small-text">(% of total)</span>
                            <span class="sort-icon">↕</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                </tbody>
            </table>
            <div class="analysis-footer">
                <button class="back-to-results-btn">← Back to Results</button>
            </div>
        `;

        resultsContainer.innerHTML = '';
        resultsContainer.appendChild(analysisContainer);

        const tableBody = analysisContainer.querySelector('tbody');

        function updateTableBody(data) {
            tableBody.innerHTML = data.map(item => `
                <tr>
                    <td>
                        <a href="${createEbaySearchUrl(item.item_name)}" 
                           class="item-link" 
                           target="_blank" 
                           rel="noopener noreferrer">
                            ${item.item_name}
                        </a>
                    </td>
                    <td>$${item.average_price.toFixed(2)}</td>
                    <td>
                        ${item.frequency}
                        <span class="percentage">
                            (${((item.frequency / stats.totalListings) * 100).toFixed(1)}%)
                        </span>
                    </td>
                </tr>
            `).join('');
        }

        updateTableBody(analysisData);
        createPriceChart(analysisData, chartId);

        const headers = analysisContainer.querySelectorAll('th[data-sort]');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const property = header.dataset.sort;
                const isCurrentlyAscending = header.classList.contains('sorted-asc');

                headers.forEach(h => {
                    h.classList.remove('sorted-asc', 'sorted-desc');
                });

                header.classList.add(isCurrentlyAscending ? 'sorted-desc' : 'sorted-asc');

                const sortedData = sortByProperty(analysisData, property, !isCurrentlyAscending);
                updateTableBody(sortedData);
            });
        });

        const backButtons = analysisContainer.querySelectorAll('.back-to-results-btn');
        backButtons.forEach(button => {
            button.addEventListener('click', () => {
                displayVehicles(originalVehiclesData);
            });
        });
    }

    function displayVehicles(vehicles) {
        originalVehiclesData = vehicles;
        resultsContainer.innerHTML = '';
        
        if (!vehicles || vehicles.length === 0) {
            resultsContainer.innerHTML = '<p>No vehicles found to display.</p>';
            return;
        }

        const vehicleGrid = document.createElement('div');
        vehicleGrid.classList.add('vehicle-grid');
        
        vehicles.forEach(vehicle => {
            const vehicleCard = document.createElement('div');
            vehicleCard.classList.add('vehicle-card');
            
            const title = vehicle.title || 'No Title Available';
            const branch = vehicle.branch || 'Location Not Specified';
            const dateListed = vehicle.date_listed || 'Date Not Specified';
            
            const ebaySearchUrl = createEbaySearchUrl(title);
            
            vehicleCard.innerHTML = `
                <h3>${title}</h3>
                <p>Location: ${branch}</p>
                <p>Date Listed: ${dateListed}</p>
                <div class="button-container">
                    <a href="${ebaySearchUrl}" 
                       class="ebay-link" 
                       target="_blank" 
                       rel="noopener noreferrer">
                        eBay Price Comparison
                    </a>
                    <button class="analysis-button" data-vehicle="${title}">
                        View Price Analysis
                    </button>
                </div>
                <div class="price-analysis" id="analysis-${title.replace(/ /g, '-')}"></div>
            `;
            
            vehicleGrid.appendChild(vehicleCard);
        });

        resultsContainer.appendChild(vehicleGrid);

        const analysisButtons = document.querySelectorAll('.analysis-button');
        analysisButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const vehicleTitle = event.target.getAttribute('data-vehicle');
                
                fetch(`/scrape_ebay/${encodeURIComponent(vehicleTitle)}`)
                    .then(response => response.json())
                    .then(data => {
                        console.log('Analysis data received:', data);
                        
                        if (data.analysis && data.analysis.length > 0) {
                            displayAnalysisTable(data.analysis, vehicleTitle);
                        } else {
                            resultsContainer.innerHTML = '<p>No analysis data available.</p>';
                        }
                    })
                    .catch(error => {
                        console.error('Analysis error:', error);
                        resultsContainer.innerHTML = '<p>An error occurred while fetching price analysis. Please try again.</p>';
                    });
            });
        });
    }

    function handleSearch(location = '') {
        resultsContainer.innerHTML = '';
        resultsContainer.appendChild(loadingIndicator);

        const make = document.getElementById('make').value;
        const model = document.getElementById('model').value;
        const year = document.getElementById('year').value;

        const formData = new URLSearchParams();
        formData.append('make', make);
        formData.append('model', model);
        formData.append('year', year);
        formData.append('location', location);

        fetch('/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
        })
            .then(response => response.json())
            .then(data => {
                resultsContainer.removeChild(loadingIndicator);
                
                let vehiclesToDisplay = [];
                
                if (Array.isArray(data)) {
                    vehiclesToDisplay = data;
                } else if (typeof data === 'object') {
                    if (data[location]) {
                        vehiclesToDisplay = data[location];
                    } else {
                        vehiclesToDisplay = Object.values(data).flat();
                    }
                }
                
                if (vehiclesToDisplay.length > 0) {
                    displayVehicles(vehiclesToDisplay);
                } else {
                    resultsContainer.innerHTML = '<p>No vehicles found matching your criteria.</p>';
                }
            })
            .catch(error => {
                console.error('Search error:', error);
                resultsContainer.removeChild(loadingIndicator);
                resultsContainer.innerHTML = '<p>An error occurred while searching for vehicles. Please try again.</p>';
            });
    }

    function scrapeLocation(location) {
        resultsContainer.innerHTML = '';
        resultsContainer.appendChild(loadingIndicator);

        fetch(`/scrape/${location}`, {
            method: 'GET',
        })
            .then(response => response.json())
            .then(data => {
                resultsContainer.removeChild(loadingIndicator);
                
                let vehiclesToDisplay = [];
                
                if (data[location]) {
                    vehiclesToDisplay = data[location];
                } else if (Array.isArray(data)) {
                    vehiclesToDisplay = data;
                } else if (typeof data === 'object') {
                    vehiclesToDisplay = Object.values(data).flat();
                }
                
                if (vehiclesToDisplay.length > 0) {
                    displayVehicles(vehiclesToDisplay);
                } else {
                    resultsContainer.innerHTML = '<p>No vehicles found for this location.</p>';
                }
            })
            .catch(error => {
                console.error('Scrape error:', error);
                resultsContainer.removeChild(loadingIndicator);
                resultsContainer.innerHTML = '<p>An error occurred while scraping. Please try again.</p>';
            });
    }

    searchButton.addEventListener('click', () => handleSearch());
    ottawaButton.addEventListener('click', () => scrapeLocation('Ottawa'));
    cornwallButton.addEventListener('click', () => scrapeLocation('Cornwall'));
    gatineauButton.addEventListener('click', () => scrapeLocation('Gatineau'));
    allLocationsButton.addEventListener('click', () => scrapeLocation('All Locations'));
});