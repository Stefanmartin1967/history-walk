import json
import math
import re

def haversine(lat1, lon1, lat2, lon2):
    R = 6371e3
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def clean_json_content(content):
    pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n.*?\n>>>>>>> .*?\n', re.DOTALL)
    cleaned_content = re.sub(pattern, r'\1', content)
    return cleaned_content

def main():
    filepath = 'public/djerba.geojson'
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        if '<<<<<<< HEAD' in content:
            content = clean_json_content(content)
        data = json.loads(content)
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        return

    features = data.get('features', [])

    target_lat = 33.781583
    target_lon = 10.889722

    print(f"Searching for features near {target_lat}, {target_lon} (El Chouhoud)...")

    for f in features:
        c = f['geometry']['coordinates']
        lat, lon = c[1], c[0]
        dist = haversine(target_lat, target_lon, lat, lon)

        if dist < 500: # Search within 500m
            props = f.get('properties', {})
            name = props.get('Nom du site FR')
            cat = props.get('Catégorie')
            print(f"- {name} ({cat}): {dist:.2f}m")

if __name__ == "__main__":
    main()
