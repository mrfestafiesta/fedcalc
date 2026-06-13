================================================================================================================
TRAIL GRAPH BUILDER (Map Editor v1.14)
================================================================================================================

1. OVERVIEW
The Trail Graph Builder is a standalone, browser-based visual map editor designed to generate strictly 
structured mathematical graph networks (Nodes and Edges). It allows developers and mapmakers to draw trail 
networks, tag Points of Interest (POIs), and export them into a specialized JSON database format designed for 
Dijkstra and Traveling Salesperson routing algorithms. 

This tool is entirely self-contained; it relies on local browser state and public APIs, requiring no backend 
servers or paid API keys.

----------------------------------------------------------------------------------------------------------------

2. CORE SYSTEMS & FEATURES
* Mapping Engine: Uses Leaflet.js with selectable OpenStreetMap street views and Esri high-res satellite imagery.
* Data Structure: State-driven. The UI is a direct reflection of an underlying JSON object. Interactions modify 
the JSON, which triggers an instant visual re-render.
* Graph Logic: Supports bidirectional mathematical edges. Contains cascading deletion logic (deleting a node 
safely severs all connections in adjacent edge arrays).
* Geolocation: Native browser GPS pinging via a custom Leaflet UI control to instantly center the map on the user.
* Search Engine: Uses the Photon API (by Komoot) to provide high-speed, debounced location autocomplete without 
triggering rate limits.
* Custom JSON Export: Uses regex stringification to collapse matrices and node parameters horizontally, keeping 
the output highly compact and readable. 

----------------------------------------------------------------------------------------------------------------

3. ELEVATION ENGINES & LIMITATIONS
The tool fetches Z-axis elevation data dynamically upon export. Users can select between two engines:

A. Open-Meteo (Default): Fast & Global. 
   - Strategy: Bulks 100 coordinates into a single request.
   - Limitation: Lower resolution, interpolated grid data. Good for general topography.

B. USGS 3DEP (Optional): High-Precision & Strict.
   - Strategy: Batches 10 requests via Promise.all.
   - Limitation 1: USA coordinates ONLY. 
   - Limitation 2: Strict error trapping. If you drop a node over the ocean or outside US borders, the export 
     will hard-abort and alert the user.

----------------------------------------------------------------------------------------------------------------

4. USAGE INSTRUCTIONS (How to Build a Map)
1. Locate your park: Use the Search bar at the top, or click the "📍" icon to use your GPS location.
2. Toggle Satellite: Hover over the layer icon (top right) to swap to Satellite view for drawing off-road trails.
3. Drop Nodes: Select "1. Drop Nodes" and click along your trail path.
4. Connect Edges: Select "2. Connect Edges". Click Node A, then Node B to draw a bidirectional yellow trail between them.
5. Tag POIs: Select "3. Tag POIs". Click any node to add metadata (name) to it. A red halo will appear.
6. Erase Errors: Select "4. Erase". 
   - Click a blue node to delete it and sever all connected lines. 
   - Click a yellow line to sever the connection without deleting the nodes. 
   - Click a red POI halo to strip the POI tag while leaving the node intact.
7. Export: Provide a filename (no spaces), choose your Elevation Source, and click "Export JSON". 

----------------------------------------------------------------------------------------------------------------

5. INTEGRATION WITH MAIN ROUTING APP
The resulting JSON file from this tool is specifically formatted to act as the primary database for your hiking/routing application.

To load the generated map into your main app:
1. Move the downloaded JSON file (e.g., `yosemite_park.json`) into the same directory as your main app's HTML/JS files.
2. Within your main app, fetch the JSON data natively or import it as a variable. 
3. The main application's Dijkstra routing logic expects the exact structure this tool exports (specifically the `data.nodes`, `data.edges`, and `data.locations` objects). 
4. The output JSON is self-documenting; it includes `mapSource` and `elevSource` keys to track data provenance.