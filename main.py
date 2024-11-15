import os
import re

vault_path = @vault_path  # Your vault's path
attachments_subpath = "Assets/Attachments"  # Subpath for attachments
normalized_vault_path = os.path.normpath(vault_path)  # Normalize the vault_path
trash = os.path.join(normalized_vault_path, ".trash")  # Define the trash directory in a platform-independent way

# Function to extract image links from a line of text
def extract_image_links(line):
    # Returns a list of filenames (extracting the first element from each match)
    return [match[0] for match in re.findall(r'\[\[(.*?\.(jpg|jpeg|png|gif|bmp))(?:\|.*?)?\]\]', line, re.IGNORECASE)]

# Function to check if the image file exists on disk
def image_exists(image_path):
    return os.path.isfile(os.path.normpath(image_path))

# Function to get all markdown files in the vault path
def get_markdown_files(vault_path, trash_path):
    markdown_files = []
    for root, _, files in os.walk(vault_path):
        # Skip the trash directory
        if trash_path in root:
            continue
        for file in files:
            if file.endswith(".md"):
                markdown_files.append(os.path.join(root, file))
    return markdown_files

# Main function
def main():
    # Normalize the vault_path
    normalized_vault_path = os.path.normpath(vault_path)
    normalized_attachments_path = os.path.normpath(os.path.join(normalized_vault_path, attachments_subpath))
    markdown_files = get_markdown_files(normalized_vault_path, trash)
    broken_links_count = 0  # Initialize a counter for broken links

    # Iterate over each markdown file
    for markdown_file in markdown_files:
        try:
            with open(markdown_file, 'r', encoding='utf-8') as file:
                for line_number, line in enumerate(file, 1):
                    image_links = extract_image_links(line)
                    for image_file in image_links:
                        # If the image file path does not contain a directory, prepend the attachments path
                        if not os.path.dirname(image_file):  # No directory in the image file path
                            image_path = os.path.join(normalized_attachments_path, image_file)
                        else:  # Image file path contains a directory
                            image_path = os.path.join(normalized_vault_path, image_file)
                        
                        # Normalize image path
                        normalized_image_path = os.path.normpath(image_path)
                        
                        # Check if the image exists, and log if it doesn’t
                        if not image_exists(normalized_image_path):
                            print(f"Broken link found in file '{markdown_file}' at line {line_number}: {normalized_image_path}")
                            broken_links_count += 1  # Increment the counter for each broken link
        except FileNotFoundError:
            print(f"File '{markdown_file}' cannot be read.")
        except Exception as e:
            print(f"An error occurred while processing file '{markdown_file}': {e}")

    # Print the count of broken links found
    print(f"\nTotal broken links found: {broken_links_count}")

if __name__ == "__main__":
    main()