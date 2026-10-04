document.addEventListener("DOMContentLoaded", function () {

    // --------------------------------------------------
    // VARIABLES
    // --------------------------------------------------

    let map = null;

    let currentLat = null;
    let currentLon = null;

    let currentMarker = null;

    let serviceMarkers = [];

    let routeLayer = null;

    let selectedCategory = "hospital";


    // --------------------------------------------------
    // INITIALIZE MAP
    // --------------------------------------------------

    function initializeMap() {

        const mapElement = document.getElementById("map");

        if (!mapElement) {

            console.error("Map element not found.");

            return;
        }


        map = L.map("map").setView(
            [20.5937, 78.9629],
            5
        );


        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution:
                    "&copy; OpenStreetMap contributors"
            }
        ).addTo(map);


        setTimeout(function () {

            map.invalidateSize();

        }, 300);
    }


    // --------------------------------------------------
    // INITIALIZE
    // --------------------------------------------------

    initializeMap();


    // --------------------------------------------------
    // CURRENT LOCATION
    // --------------------------------------------------

    window.getCurrentLocation = function () {

        showStatus("Detecting your current location...");


        if (!navigator.geolocation) {

            showError(
                "Your browser does not support location detection."
            );

            return;
        }


        navigator.geolocation.getCurrentPosition(

            function (position) {

                currentLat =
                    position.coords.latitude;

                currentLon =
                    position.coords.longitude;


                setCurrentLocationMarker(
                    currentLat,
                    currentLon
                );


                map.setView(
                    [currentLat, currentLon],
                    14
                );


                showStatus(
                    "Current location detected successfully."
                );


                loadNearbyServices();
            },


            function (error) {

                console.error(error);

                showError(
                    "Location permission denied. Please search your location manually."
                );
            },

            {
                enableHighAccuracy: true,

                timeout: 15000,

                maximumAge: 0
            }
        );
    };


    // --------------------------------------------------
    // CURRENT LOCATION MARKER
    // --------------------------------------------------

    function setCurrentLocationMarker(lat, lon) {

        if (currentMarker) {

            map.removeLayer(currentMarker);
        }


        const icon = L.divIcon({

            className: "current-pin",

            html: `
                <div class="pin-pulse"></div>
                <div class="pin-dot"></div>
            `,

            iconSize: [30, 30],

            iconAnchor: [15, 15]
        });


        currentMarker = L.marker(
            [lat, lon],
            {
                icon: icon
            }
        ).addTo(map);


        currentMarker.bindPopup(
            "<b>📍 Your Current Location</b>"
        );
    }


    // --------------------------------------------------
    // SEARCH LOCATION
    // --------------------------------------------------

    window.searchLocation = async function () {

        const input =
            document.getElementById("locationInput");


        if (!input) return;


        const location =
            input.value.trim();


        if (!location) {

            showError(
                "Please enter a location."
            );

            return;
        }


        showStatus(
            "Searching location..."
        );


        try {

            const response = await fetch(
                `/api/geocode?location=${encodeURIComponent(location)}`
            );


            const data =
                await response.json();


            if (!data.success) {

                throw new Error(
                    data.message ||
                    "Location not found."
                );
            }


            currentLat = data.lat;

            currentLon = data.lon;


            setCurrentLocationMarker(
                currentLat,
                currentLon
            );


            map.setView(
                [currentLat, currentLon],
                14
            );


            showStatus(
                `Location: ${data.display_name}`
            );


            loadNearbyServices();

        }

        catch (error) {

            console.error(error);

            showError(
                error.message
            );
        }
    };


    // --------------------------------------------------
    // ENTER KEY SEARCH
    // --------------------------------------------------

    const locationInput =
        document.getElementById("locationInput");


    if (locationInput) {

        locationInput.addEventListener(
            "keydown",
            function (event) {

                if (event.key === "Enter") {

                    searchLocation();
                }
            }
        );
    }


    // --------------------------------------------------
    // SELECT CATEGORY
    // --------------------------------------------------

    window.selectCategory = function (category) {

        selectedCategory = category;


        // Remove active class
        document
            .querySelectorAll(".service-card")
            .forEach(function (card) {

                card.classList.remove("active");
            });


        // Add active class
        const selectedCard =
            document.querySelector(
                `[data-category="${category}"]`
            );


        if (selectedCard) {

            selectedCard.classList.add(
                "active"
            );
        }


        if (!currentLat || !currentLon) {

            showStatus(
                "Please select or detect your location first."
            );

            return;
        }


        loadNearbyServices();
    };


    // --------------------------------------------------
    // LOAD NEARBY SERVICES
    // --------------------------------------------------

    async function loadNearbyServices() {

        if (
            currentLat === null ||
            currentLon === null
        ) {

            return;
        }


        showStatus(
            "Finding nearby services and calculating road distance..."
        );


        clearServiceMarkers();

        clearRoute();


        try {

            const response = await fetch(

                `/api/nearby?lat=${currentLat}` +
                `&lon=${currentLon}` +
                `&category=${selectedCategory}`

            );


            const data =
                await response.json();


            if (!data.success) {

                throw new Error(
                    data.message ||
                    "Unable to load services."
                );
            }


            renderServices(
                data.services
            );


            showStatus(
                `${data.services.length} nearby ${selectedCategory} services found.`
            );

        }

        catch (error) {

            console.error(error);

            showError(
                error.message
            );
        }
    }


    // --------------------------------------------------
    // RENDER SERVICES
    // --------------------------------------------------

    function renderServices(services) {

        const resultsList =
            document.getElementById(
                "resultsList"
            );


        const resultCount =
            document.getElementById(
                "resultCount"
            );


        if (!resultsList) return;


        resultsList.innerHTML = "";


        if (resultCount) {

            resultCount.textContent =
                services.length;
        }


        if (services.length === 0) {

            resultsList.innerHTML = `

                <div class="no-results">

                    <div class="no-results-icon">
                        🔍
                    </div>

                    <h3>No services found</h3>

                    <p>
                        Try another location or category.
                    </p>

                </div>

            `;

            return;
        }


        // --------------------------------------------------
        // CREATE SERVICE MARKERS
        // --------------------------------------------------

        services.forEach(
            function (service, index) {

                addServiceMarker(
                    service,
                    index + 1
                );

            }
        );


        // --------------------------------------------------
        // CREATE RESULT CARDS
        // --------------------------------------------------

        services.forEach(
            function (service, index) {

                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "result-card";


                card.innerHTML = `

                    <div class="result-number">
                        ${index + 1}
                    </div>

                    <div class="result-content">

                        <h3>
                            ${escapeHTML(service.name)}
                        </h3>

                        <div class="result-distance">

                            <strong>
                                ${Number(service.distance).toFixed(2)} km
                            </strong>

                            <span
                                class="distance-category ${service.category.toLowerCase()}"
                            >
                                ${service.category}
                            </span>

                        </div>

                        <div class="road-distance">
                            🚗 Actual road distance
                        </div>

                    </div>

                    <button
                        class="route-button"
                        title="Show route"
                    >
                        Route
                    </button>
                `;


                // --------------------------------------------------
                // CARD CLICK
                // --------------------------------------------------

                card.addEventListener(
                    "click",
                    function () {

                        showRouteToService(
                            service
                        );

                    }
                );


                resultsList.appendChild(
                    card
                );

            }
        );
    }


    // --------------------------------------------------
    // SERVICE MARKER
    // --------------------------------------------------

    function addServiceMarker(
        service,
        number
    ) {

        const icon =
            L.divIcon({

                className:
                    "service-pin",

                html: `

                    <div
                        style="
                            background:${service.color};
                            width:32px;
                            height:32px;
                            border-radius:50%;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            color:white;
                            font-weight:bold;
                            border:3px solid white;
                            box-shadow:0 3px 10px rgba(0,0,0,0.35);
                        "
                    >
                        ${number}
                    </div>

                `,

                iconSize: [32, 32],

                iconAnchor: [16, 16]
            });


        const marker =
            L.marker(
                [
                    service.lat,
                    service.lon
                ],
                {
                    icon: icon
                }
            ).addTo(map);


        marker.bindPopup(`

            <div class="route-popup">

                <h3>
                    ${escapeHTML(service.name)}
                </h3>

                <p>
                    📍 Distance:
                    <strong>
                        ${Number(service.distance).toFixed(2)} km
                    </strong>
                </p>

                <p>
                    🛣️ Actual road distance
                </p>

                <p>
                    📊 Category:
                    <strong>
                        ${service.category}
                    </strong>
                </p>

                <button
                    onclick="showRouteToServiceByCoordinates(
                        ${service.lat},
                        ${service.lon},
                        '${escapeHTML(service.name).replace(/'/g, "\\'")}'
                    )"
                >
                    Show Route
                </button>

            </div>

        `);


        marker.on(
            "click",
            function () {

                showRouteToService(
                    service
                );

            }
        );


        serviceMarkers.push(
            marker
        );
    }


    // --------------------------------------------------
    // SHOW ROUTE
    // --------------------------------------------------

    window.showRouteToService =
        async function (service) {

            await showRouteToServiceByCoordinates(
                service.lat,
                service.lon,
                service.name
            );
        };


    window.showRouteToServiceByCoordinates =
        async function (
            destinationLat,
            destinationLon,
            destinationName
        ) {

            if (
                currentLat === null ||
                currentLon === null
            ) {

                showError(
                    "Current location is not available."
                );

                return;
            }


            showStatus(
                "Calculating actual road route..."
            );


            clearRoute();


            try {

                const url =
                    `/api/route` +
                    `?start_lat=${currentLat}` +
                    `&start_lon=${currentLon}` +
                    `&end_lat=${destinationLat}` +
                    `&end_lon=${destinationLon}`;


                const response =
                    await fetch(url);


                const data =
                    await response.json();


                if (!data.success) {

                    throw new Error(
                        data.message ||
                        "Unable to calculate route."
                    );
                }


                // --------------------------------------------------
                // DRAW ACTUAL ROAD ROUTE
                // --------------------------------------------------

                routeLayer =
                    L.geoJSON(
                        data.geometry,
                        {

                            style: {

                                color:
                                    data.color,

                                weight: 7,

                                opacity: 0.9
                            }

                        }
                    ).addTo(map);


                // --------------------------------------------------
                // FIT ROUTE ON MAP
                // --------------------------------------------------

                const bounds =
                    routeLayer.getBounds();


                map.fitBounds(
                    bounds,
                    {
                        padding: [50, 50]
                    }
                );


                // --------------------------------------------------
                // ROUTE POPUP
                // --------------------------------------------------

                routeLayer.bindPopup(`

                    <div class="route-popup">

                        <h3>
                            🚨 Route Information
                        </h3>

                        <p>
                            <strong>
                                ${escapeHTML(destinationName)}
                            </strong>
                        </p>

                        <p>
                            🛣️ Road Distance:
                            <strong>
                                ${Number(data.distance).toFixed(2)} km
                            </strong>
                        </p>

                        <p>
                            ⏱️ Estimated Time:
                            <strong>
                                ${Number(data.duration).toFixed(1)} min
                            </strong>
                        </p>

                        <p>
                            📊 Distance:
                            <strong>
                                ${data.category}
                            </strong>
                        </p>

                    </div>

                `);


                routeLayer.openPopup();


                showStatus(

                    `Route found: ` +
                    `${Number(data.distance).toFixed(2)} km ` +
                    `(${Number(data.duration).toFixed(1)} min)`

                );

            }

            catch (error) {

                console.error(error);

                showError(
                    error.message
                );
            }
        };


    // --------------------------------------------------
    // CLEAR SERVICE MARKERS
    // --------------------------------------------------

    function clearServiceMarkers() {

        serviceMarkers.forEach(
            function (marker) {

                map.removeLayer(marker);

            }
        );


        serviceMarkers = [];
    }


    // --------------------------------------------------
    // CLEAR ROUTE
    // --------------------------------------------------

    function clearRoute() {

        if (routeLayer) {

            map.removeLayer(
                routeLayer
            );

            routeLayer = null;
        }
    }


    // --------------------------------------------------
    // STATUS MESSAGE
    // --------------------------------------------------

    function showStatus(message) {

        const status =
            document.getElementById(
                "locationStatus"
            );


        if (status) {

            status.textContent =
                message;

            status.className =
                "location-status";
        }
    }


    // --------------------------------------------------
    // ERROR MESSAGE
    // --------------------------------------------------

    function showError(message) {

        const status =
            document.getElementById(
                "locationStatus"
            );


        if (status) {

            status.textContent =
                "⚠️ " + message;

            status.className =
                "location-status error";
        }
    }


    // --------------------------------------------------
    // ESCAPE HTML
    // --------------------------------------------------

    function escapeHTML(value) {

        return String(value)

            .replace(
                /&/g,
                "&amp;"
            )

            .replace(
                /</g,
                "&lt;"
            )

            .replace(
                />/g,
                "&gt;"
            )

            .replace(
                /"/g,
                "&quot;"
            )

            .replace(
                /'/g,
                "&#039;"
            );
    }


    // --------------------------------------------------
    // LOAD DEFAULT LOCATION
    // --------------------------------------------------

    // Automatically try current location
    // Uncomment this if you want automatic detection.

    // getCurrentLocation();

});