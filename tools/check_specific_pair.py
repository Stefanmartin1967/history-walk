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

    chouhoud = None
    chehoud = None

    for f in features:
        props = f.get('properties', {})
        name = props.get('Nom du site FR')
        if name == "Mosquée El Chouhoud":
            chouhoud = f
        elif name == "Mosquée El Chehoud":
            chehoud = f

    if chouhoud:
        c = chouhoud['geometry']['coordinates']
        print(f"Found Mosquée El Chouhoud at {c[1]}, {c[0]}")
    else:
        print("Mosquée El Chouhoud not found")

    if chehoud:
        c = chehoud['geometry']['coordinates']
        print(f"Found Mosquée El Chehoud at {c[1]}, {c[0]}")
    else:
        print("Mosquée El Chehoud not found")

    if chouhoud and chehoud:
        c1 = chouhoud['geometry']['coordinates']
        c2 = chehoud['geometry']['coordinates']
        dist = haversine(c1[1], c1[0], c2[1], c2[0])
        print(f"Distance between them: {dist:.2f}m")

if __name__ == "__main__":
    main()
