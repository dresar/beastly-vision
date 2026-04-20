import os
import sys
import yaml

def prepare_dataset(dataset_name):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "datasets", dataset_name.lower().replace(" ", "_"))
    
    # Define YOLO structure
    folders = [
        "train/images", "train/labels",
        "val/images", "val/labels",
        "test/images", "test/labels"
    ]
    
    print(f"--- Preparing Dataset: {dataset_name} ---")
    
    # Create folders
    for folder in folders:
        path = os.path.join(data_dir, folder)
        os.makedirs(path, exist_ok=True)
        print(f"Created: {folder}")

    # Define Classes (Common Wildlife for WildGuard)
    classes = [
        "Tiger", "Elephant", "Monkey", "Deer", "Wild Boar", "Person", "Unknown"
    ]

    # Create dataset.yaml
    yaml_data = {
        "path": data_dir,
        "train": "train/images",
        "val": "val/images",
        "test": "test/images",
        "names": {i: name for i, name in enumerate(classes)}
    }

    yaml_path = os.path.join(data_dir, "dataset.yaml")
    with open(yaml_path, "w") as f:
        yaml.dump(yaml_data, f, default_flow_style=False)
    
    print(f"\nSUCCESS: dataset.yaml created at {yaml_path}")
    print(f"Classes: {', '.join(classes)}")
    print("Next step: Move your images and .txt labels into the folders above.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python dataset_manager.py <dataset_name>")
        sys.exit(1)
    
    prepare_dataset(sys.argv[1])
