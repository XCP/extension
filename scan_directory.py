import os
import sys
import argparse

def should_ignore(name):
    """
    Determines if a file or directory should be ignored.
      - Ignores anything whose base name starts with a dot.
      - Ignores any directory or file named 'node_modules'.
      - Ignores files named 'scan_directory.py' or 'package-lock.json'.
    """
    if name.startswith('.'):
        return True
    if name in ("node_modules", "scan_directory.py", "package-lock.json"):
        return True
    return False

def matches_filter(path, filter_keyword):
    """
    Checks if the path contains the filter keyword (case-insensitive).
    If filter_keyword is None or empty, returns True (no filtering).
    """
    if not filter_keyword:
        return True
    return filter_keyword.lower() in path.lower()

def should_skip(path, skip_keywords):
    """
    Checks if the path contains any of the skip keywords (case-insensitive).
    If skip_keywords is None or empty, returns False (no skipping).
    """
    if not skip_keywords:
        return False
    path_lower = path.lower()
    return any(keyword.lower() in path_lower for keyword in skip_keywords)

def generate_structure(root_dir, filter_keyword=None, skip_keywords=None):
    """
    Walk through root_dir and collect folder and file paths while skipping ignored items.
    Optionally filter by a keyword in the path and skip paths with specified keywords.

    Args:
      - root_dir: The root directory to scan.
      - filter_keyword: Optional string to filter paths (e.g., "compose").
      - skip_keywords: Optional list of strings to exclude paths (e.g., ["negative", "negative2"]).

    Returns:
      - folders: a list of folder paths (formatted in Unix style with a leading "/" and a trailing "/" when appropriate)
      - files: a list of tuples (relative_file_path, full_file_path)
    """
    folders = []
    files = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip ignored directories (modify in place so os.walk does not descend into them)
        dirnames[:] = [d for d in dirnames if not should_ignore(d)]
        
        # Compute the relative directory path in Unix style.
        rel_dir = os.path.relpath(dirpath, root_dir)
        if rel_dir == ".":
            rel_dir = ""
        posix_dir = "/" + rel_dir.replace(os.sep, "/") + ("/" if rel_dir != "" else "")
        
        # Apply inclusion and exclusion filters to folders
        if matches_filter(posix_dir, filter_keyword) and not should_skip(posix_dir, skip_keywords):
            folders.append(posix_dir)
        
        for filename in filenames:
            if should_ignore(filename):
                continue
            full_path = os.path.join(dirpath, filename)
            rel_file = os.path.relpath(full_path, root_dir).replace(os.sep, "/")
            # Apply inclusion and exclusion filters to files
            if matches_filter(rel_file, filter_keyword) and not should_skip(rel_file, skip_keywords):
                files.append((rel_file, full_path))
            
    return folders, files

def output_text(folders, files, output_filename):
    """
    Write a plain text file that first lists the folder names and file paths,
    and then (in a separate section) lists each file's contents.
    
    Output format:
    
    Folders:
    / 
    /src/
    /src/assets/
    
    Files:
    /src/app.tsx
    /src/main.tsx
    /src/assets/logo.png
    
    File Contents:
    /src/app.tsx
      [contents of the file]
      (each line indented)
    
    /src/main.tsx
      [contents of the file]
    
    /src/assets/logo.png
      [contents of the file]
    """
    with open(output_filename, "w", encoding="utf-8") as out:
        # Section 1: List folders and files (structure only)
        out.write("Folders:\n")
        for folder in sorted(folders):
            out.write(f"{folder}\n")
            
        out.write("\nFiles:\n")
        # Display file paths with a leading slash.
        for rel_file, _ in sorted(files, key=lambda f: f[0]):
            out.write(f"/{rel_file}\n")
        
        # Section 2: File Contents
        out.write("\nFile Contents:\n")
        for rel_file, full_path in sorted(files, key=lambda f: f[0]):
            display_path = "/" + rel_file
            out.write(f"{display_path}\n")
            out.write("  [contents of the file]\n")
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                content = f"[Error reading file: {e}]"
            for line in content.splitlines():
                out.write("  " + line + "\n")
            out.write("\n")
    print(f"Output written to {output_filename}")

def main():
    parser = argparse.ArgumentParser(
        description="Generate a project listing that first shows folder names and file paths, then lists file contents. "
                    "Uses the current directory if no path is provided. "
                    "Ignored items: names starting with a dot, any 'node_modules' folders, and files named "
                    "'scan_directory.py' or 'package-lock.json'. Optionally filter by a keyword in paths and skip paths with specified keywords."
    )
    parser.add_argument(
        "path",
        nargs="?",  # Makes the path argument optional
        default=os.getcwd(),  # Defaults to current working directory
        help="Path to the directory to scan (defaults to current directory)."
    )
    parser.add_argument(
        "--filter",
        help="Optional keyword to filter folders and files (e.g., 'compose')."
    )
    parser.add_argument(
        "--skip",
        help="Optional comma-separated keywords to exclude folders and files (e.g., 'negative,negative2,negative3')."
    )
    parser.add_argument(
        "--output",
        default="output.txt",
        help="Output file name (defaults to 'output.txt')."
    )
    args = parser.parse_args()

    root_dir = args.path
    if not os.path.exists(root_dir):
        print(f"Error: The path '{root_dir}' does not exist.")
        sys.exit(1)
    
    root_dir = os.path.abspath(root_dir)
    # Split the skip argument into a list if provided, otherwise None
    skip_keywords = args.skip.split(',') if args.skip else None
    folders, files = generate_structure(root_dir, filter_keyword=args.filter, skip_keywords=skip_keywords)
    
    output_text(folders, files, args.output)

if __name__ == '__main__':
    main()
    