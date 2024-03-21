let map, hexLayer;

const GeoUtils = {
    EARTH_RADIUS_METERS: 6371000,

    radiansToDegrees: (r) => r * 180 / Math.PI,
    degreesToRadians: (d) => d * Math.PI / 180,

    getDistanceOnEarthInMeters: (lat1, lon1, lat2, lon2) => {
        const lat1Rad  = GeoUtils.degreesToRadians(lat1);
        const lat2Rad  = GeoUtils.degreesToRadians(lat2);
        const lonDelta = GeoUtils.degreesToRadians(lon2 - lon1);
        const x = Math.sin(lat1Rad) * Math.sin(lat2Rad) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lonDelta);
        return GeoUtils.EARTH_RADIUS_METERS * Math.acos(Math.max(Math.min(x, 1), -1));
    }
};

const ZOOM_TO_H3_RES_CORRESPONDENCE = {
    5: 1,
    6: 2,
    7: 3,
    8: 3,
    9: 7,
    10: 7,
    11: 7,
    12: 7,
    13: 7,
    14: 7,
    15: 7,
    16: 7,
    17: 7,
    18: 10,
    19: 11,
    20: 11,
    21: 12,
    22: 13,
    23: 14,
    24: 15,
};

const H3_RES_TO_ZOOM_CORRESPONDENCE = {};
for (const [zoom, res] of Object.entries(ZOOM_TO_H3_RES_CORRESPONDENCE)) {
    H3_RES_TO_ZOOM_CORRESPONDENCE[res] = zoom;
}

const getH3ResForMapZoom = (mapZoom) => {
    return ZOOM_TO_H3_RES_CORRESPONDENCE[mapZoom] ?? Math.floor((mapZoom - 1) * 0.7);
};

const h3BoundsToPolygon = (lngLatH3Bounds) => {
    lngLatH3Bounds.push(lngLatH3Bounds[0]); // "close" the polygon
    return lngLatH3Bounds;
};

/**
 * Parse the current Query String and return its components as an object.
 */
const parseQueryString = () => {
    const queryString = window.location.search;
    const query = {};
    const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    }
    return query;
};

const queryParams = parseQueryString();

const copyToClipboard = (text) => {
    const dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    dummy.value = text;
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);
};

var app = new Vue({
    el: "#app",

    data: {
        searchH3Id: undefined,
        gotoLatLon: undefined,
        currentH3Res: 7,

    },

    computed: {
    },

    methods: {

        computeAverageEdgeLengthInMeters: function(vertexLocations) {
            let totalLength = 0;
            let edgeCount = 0;
            for (let i = 1; i < vertexLocations.length; i++) {
                const [fromLat, fromLng] = vertexLocations[i - 1];
                const [toLat, toLng] = vertexLocations[i];
                const edgeDistance = GeoUtils.getDistanceOnEarthInMeters(fromLat, fromLng, toLat, toLng);
                totalLength += edgeDistance;
                edgeCount++;
            }
            return totalLength / edgeCount;
        },

        updateMapDisplay: function() {
            if (hexLayer) {
                hexLayer.remove();
            }

            hexLayer = L.layerGroup().addTo(map);

            const zoom = map.getZoom();
            this.currentH3Res = getH3ResForMapZoom(zoom);
            const { _southWest: sw, _northEast: ne} = map.getBounds();

            const boundsPolygon =[
                [ sw.lat, sw.lng ],
                [ ne.lat, sw.lng ],
                [ ne.lat, ne.lng ],
                [ sw.lat, ne.lng ],
                [ sw.lat, sw.lng ],
            ];

            const h3s = h3.polygonToCells(boundsPolygon, this.currentH3Res);

            for (const h3id of h3s) {

                const polygonLayer = L.layerGroup()
                    .addTo(hexLayer);

                const isSelected = h3id === this.searchH3Id;

                const style = isSelected ? { fillColor: "red" } : {};

                const h3Bounds = h3.cellToBoundary(h3id);
                const averageEdgeLength = this.computeAverageEdgeLengthInMeters(h3Bounds);
                const cellArea = h3.cellArea(h3id, "m2");

                const tooltipText = `
                Cell ID: <b>${ h3id }</b>
                <br />
                Average edge length (m): <b>${ averageEdgeLength.toLocaleString() }</b>
                <br />
                Cell area (m^2): <b>${ cellArea.toLocaleString() }</b>
                `;

                const h3Polygon = L.polygon(h3BoundsToPolygon(h3Bounds), style)
                    .on('click', () => copyToClipboard(h3id))
                    .bindTooltip(tooltipText)
                    .addTo(polygonLayer);

                // less SVG, otherwise perf is bad
                if (Math.random() > 0.8 || isSelected) {
                    var svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svgElement.setAttribute('xmlns', "http://www.w3.org/2000/svg");
                    svgElement.setAttribute('viewBox', "0 0 200 200");
                    svgElement.innerHTML = `<text x="19" y="75" class="h3Text">${h3id}</text>`;
                    var svgElementBounds = h3Polygon.getBounds();
                    L.svgOverlay(svgElement, svgElementBounds).addTo(polygonLayer);
                }
            }
        },

        gotoLocation: function() {

             // Extract lat and lon from gotoLatLon
            const [lat, lon] = (this.gotoLatLon || "").split(",").map(Number);

        // Check for valid values and display pin point if valid
            if (Number.isFinite(lat) && Number.isFinite(lon)
                && lat <= 90 && lat >= -90 && lon <= 180 && lon >= -180) {
                const marker = L.marker([lat, lon], { icon: L.icon({ iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png", iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png", shadowSize: [41, 41] }, { fillColor: "#ffff00", color: "#000" }) }).addTo(map)
                map.setView([lat, lon], 14);
            } else {
                console.error("Invalid latitude and longitude provided.");
            }

            // if (Number.isFinite(lat) && Number.isFinite(lon)
            //     && lat <= 90 && lat >= -90 && lon <= 180 && lon >= -180) {
            //     map.setView([lat, lon], 12);
            // }
        },

        findH3: function() {
            if (!h3.isValidCell(this.searchH3Id)) {
                return;
            }
            const h3Boundary = h3.cellToBoundary(this.searchH3Id);

            let bounds = undefined;

            for ([lat, lng] of h3Boundary) {
                if (bounds === undefined) {
                    bounds = new L.LatLngBounds([lat, lng], [lat, lng]);
                } else {
                    bounds.extend([lat, lng]);
                }
            }

            map.fitBounds(bounds);

            const newZoom = H3_RES_TO_ZOOM_CORRESPONDENCE[h3.getResolution(this.searchH3Id)];
            map.setZoom(newZoom);
        }
    },

    beforeMount() {
    },

    mounted() {
        document.addEventListener("DOMContentLoaded", () => {
            map = L.map('mapid');

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                minZoom: 5,
                maxNativeZoom: 15,
                maxZoom: 17,
                attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            }).addTo(map);
            pointsLayer = L.layerGroup([]).addTo(map);

            const initialLat = queryParams.lat ?? 19;
            const initialLng = queryParams.lng ?? 72.8;
            const initialZoom = queryParams.zoom ?? 13;
            map.setView([initialLat, initialLng], initialZoom);
            map.on("zoomend", this.updateMapDisplay);
            map.on("moveend", this.updateMapDisplay);
            map.on("click", (e) => {
                const { lat, lng } = e.latlng;
        
                // Round lat and lng to 4 decimal places
                const roundedLat = lat.toFixed(4);
                const roundedLng = lng.toFixed(4);
        
                this.gotoLatLon = `${roundedLat},${roundedLng}`; // Update gotoLatLon on map click
                this.gotoLocation(); // Trigger gotoLocation to show pin point
            });
        
            const { h3 } = queryParams;
            console.log(h3)
            if (h3) {
                this.searchH3Id = h3;
                window.setTimeout(() => this.findH3(), 50);
            }

            this.updateMapDisplay();
        });
    }
});

