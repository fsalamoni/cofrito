"""Otimiza o mascote Cofrito: redimensiona e comprime."""
import sys
from pathlib import Path
from PIL import Image


def optimize(input_path: Path, output_path: Path, max_size: int = 400, quality: int = 85):
    img = Image.open(input_path).convert("RGBA")
    img.thumbnail((max_size, max_size), Image.LANCZOS)
    img.save(output_path, "PNG", optimize=True)
    size_kb = output_path.stat().st_size / 1024
    print(f"  {output_path.name}: {img.size[0]}x{img.size[1]} ({size_kb:.1f} KB)")


def main():
    src_dir = Path(__file__).parent.parent / "frontend" / "src" / "assets" / "cofrito"
    pub_dir = Path(__file__).parent.parent / "frontend" / "public"

    # Versão grande (avatar no chat)
    optimize(src_dir / "cofrito.png", src_dir / "cofrito.png", max_size=400)
    optimize(src_dir / "cofrito.png", src_dir / "cofrito-200.png", max_size=200)
    optimize(src_dir / "cofrito.png", src_dir / "cofrito-thinking.png", max_size=200)
    optimize(src_dir / "cofrito.png", src_dir / "cofrito-error.png", max_size=200)

    # Versões menores pro public (header do site + FAB)
    optimize(src_dir / "cofrito.png", pub_dir / "cofrito.png", max_size=256)
    optimize(src_dir / "cofrito.png", pub_dir / "cofrito-fab.png", max_size=128)


if __name__ == "__main__":
    main()
