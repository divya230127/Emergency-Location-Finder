from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

OSRM_URL = "https://router.project-osrm.org"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

HEADERS = {
    "User-Agent": "EmergencyLocationFinder/1.0 Student Project"
}


# --------------------------------------------------
# HOME PAGE
# --------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


# --------------------------------------------------
# DISTANCE CATEGORY
# --------------------------------------------------

def get_distance_category(distance_km):
    if distance_km <= 2:
        return {
            "name": "NEAR",
            "color": "#22c55e"
        }

    elif distance_km <= 5:
        return {
            "name": "MEDIUM",
            "color": "#f59e0b"
        }

    else:
        return {
            "name": "FAR",
            "color": "#ef4444"
        }


# --------------------------------------------------
# GEOCODING
# --------------------------------------------------

@app.route("/api/geocode")
def geocode():

    location = request.args.get("location", "").strip()

    if not location:
        return jsonify({
            "success": False,
            "message": "Please enter a location."
        }), 400

    try:

        params = {
            "q": location,
            "format": "json",
            "limit": 1
        }

        response = requests.get(
            NOMINATIM_URL,
            params=params,
            headers=HEADERS,
            timeout=15
        )

        response.raise_for_status()

        data = response.json()

        if not data:
            return jsonify({
                "success": False,
                "message": "Location not found."
            }), 404

        result = data[0]

        return jsonify({
            "success": True,
            "lat": float(result["lat"]),
            "lon": float(result["lon"]),
            "display_name": result["display_name"]
        })

    except Exception as e:

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# --------------------------------------------------
# NEARBY SERVICES
# --------------------------------------------------

@app.route("/api/nearby")
def nearby():

    try:

        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
        category = request.args.get("category", "hospital")

    except Exception:

        return jsonify({
            "success": False,
            "message": "Invalid location."
        }), 400


    # --------------------------------------------------
    # CATEGORY → OPENSTREETMAP QUERY
    # --------------------------------------------------

    queries = {

        "hospital": """
        nwr["amenity"="hospital"](around:5000,{lat},{lon});
        """,

        "police": """
        nwr["amenity"="police"](around:5000,{lat},{lon});
        """,

        "pharmacy": """
        nwr["amenity"="pharmacy"](around:5000,{lat},{lon});
        """,

        "fire": """
        nwr["amenity"="fire_station"](around:5000,{lat},{lon});
        """,

        "clinic": """
        (
            nwr["amenity"="clinic"](around:5000,{lat},{lon});
            nwr["healthcare"="clinic"](around:5000,{lat},{lon});
        );
        """
    }


    if category not in queries:

        return jsonify({
            "success": False,
            "message": "Invalid service category."
        }), 400


    query = f"""
    [out:json][timeout:25];

    {queries[category].format(
        lat=lat,
        lon=lon
    )}

    out center;
    """


    # --------------------------------------------------
    # GET PLACES FROM OVERPASS
    # --------------------------------------------------

    try:

        response = requests.post(
            OVERPASS_URL,
            data=query,
            headers=HEADERS,
            timeout=30
        )

        response.raise_for_status()

        data = response.json()

    except Exception as e:

        return jsonify({
            "success": False,
            "message": f"Unable to find nearby services: {str(e)}"
        }), 500


    elements = data.get("elements", [])


    if not elements:

        return jsonify({
            "success": True,
            "services": []
        })


    # --------------------------------------------------
    # EXTRACT LATITUDE AND LONGITUDE
    # --------------------------------------------------

    places = []

    for element in elements:

        tags = element.get("tags", {})

        name = tags.get("name")

        if not name:
            name = category.title()


        # For nodes
        if element.get("lat") is not None:

            place_lat = element["lat"]
            place_lon = element["lon"]

        # For ways / relations
        elif element.get("center"):

            place_lat = element["center"]["lat"]
            place_lon = element["center"]["lon"]

        else:
            continue


        places.append({
            "name": name,
            "lat": float(place_lat),
            "lon": float(place_lon),
            "type": category
        })


    # Limit to first 15 places
    places = places[:15]


    if not places:

        return jsonify({
            "success": True,
            "services": []
        })


    # --------------------------------------------------
    # OSRM TABLE API
    #
    # IMPORTANT:
    # This calculates ROAD DISTANCE.
    # It is NOT latitude/longitude difference.
    # --------------------------------------------------

    coordinates = []

    # Current location first
    coordinates.append(f"{lon},{lat}")

    # Add destinations
    for place in places:

        coordinates.append(
            f"{place['lon']},{place['lat']}"
        )


    coordinates_string = ";".join(coordinates)


    table_url = (
        f"{OSRM_URL}/table/v1/driving/"
        f"{coordinates_string}"
    )


    try:

        table_response = requests.get(
            table_url,
            params={
                "sources": "0",
                "annotations": "distance"
            },
            timeout=30
        )

        table_response.raise_for_status()

        table_data = table_response.json()

    except Exception as e:

        return jsonify({
            "success": False,
            "message": f"Road distance service failed: {str(e)}"
        }), 500


    # --------------------------------------------------
    # GET ROAD DISTANCES
    # --------------------------------------------------

    distances = table_data.get("distances")

    if not distances or not distances[0]:

        return jsonify({
            "success": False,
            "message": "Could not calculate road distances."
        }), 500


    source_distances = distances[0]


    services = []


    for index, place in enumerate(places, start=1):

        # OSRM distance is in METERS
        distance_meters = source_distances[index]


        # Sometimes OSRM can return null
        if distance_meters is None:
            continue


        # Convert METERS → KILOMETERS
        distance_km = float(distance_meters) / 1000.0


        # Get Near / Medium / Far
        distance_category = get_distance_category(
            distance_km
        )


        services.append({

            "name": place["name"],

            "lat": place["lat"],

            "lon": place["lon"],

            # Actual road distance in km
            "distance": round(distance_km, 2),

            # Example: 2.35 km
            "distance_text": f"{distance_km:.2f} km",

            "category": distance_category["name"],

            "color": distance_category["color"],

            "type": place["type"]
        })


    # --------------------------------------------------
    # SORT BY ACTUAL ROAD DISTANCE
    # --------------------------------------------------

    services.sort(
        key=lambda x: x["distance"]
    )


    return jsonify({
        "success": True,
        "services": services
    })


# --------------------------------------------------
# ROUTE API
# --------------------------------------------------

@app.route("/api/route")
def route():

    try:

        start_lat = float(
            request.args.get("start_lat")
        )

        start_lon = float(
            request.args.get("start_lon")
        )

        end_lat = float(
            request.args.get("end_lat")
        )

        end_lon = float(
            request.args.get("end_lon")
        )

    except Exception:

        return jsonify({
            "success": False,
            "message": "Invalid route coordinates."
        }), 400


    # --------------------------------------------------
    # OSRM ROUTE API
    # --------------------------------------------------

    route_url = (
        f"{OSRM_URL}/route/v1/driving/"
        f"{start_lon},{start_lat};"
        f"{end_lon},{end_lat}"
    )


    try:

        response = requests.get(

            route_url,

            params={
                "overview": "full",
                "geometries": "geojson",
                "steps": "true"
            },

            timeout=30
        )

        response.raise_for_status()

        data = response.json()

    except Exception as e:

        return jsonify({
            "success": False,
            "message": f"Route calculation failed: {str(e)}"
        }), 500


    routes = data.get("routes", [])


    if not routes:

        return jsonify({
            "success": False,
            "message": "No route found."
        }), 404


    selected_route = routes[0]


    # --------------------------------------------------
    # ACTUAL ROAD DISTANCE
    # --------------------------------------------------

    distance_meters = selected_route.get(
        "distance",
        0
    )


    distance_km = distance_meters / 1000.0


    # --------------------------------------------------
    # TRAVEL TIME
    # --------------------------------------------------

    duration_seconds = selected_route.get(
        "duration",
        0
    )


    duration_minutes = duration_seconds / 60.0


    # --------------------------------------------------
    # DISTANCE CATEGORY
    # --------------------------------------------------

    distance_category = get_distance_category(
        distance_km
    )


    return jsonify({

        "success": True,

        # ACTUAL ROAD DISTANCE
        "distance": round(distance_km, 2),

        "distance_text": f"{distance_km:.2f} km",

        "duration": round(duration_minutes, 1),

        "duration_text": f"{duration_minutes:.1f} min",

        "category": distance_category["name"],

        "color": distance_category["color"],

        "geometry": selected_route["geometry"]
    })


# --------------------------------------------------
# RUN FLASK
# --------------------------------------------------

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )