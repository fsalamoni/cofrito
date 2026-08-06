"""
Processa a imagem do mascote Cofrito: remove fundo branco, gera PNGs
com transparência em múltiplos tamanhos.

Usage: python process-cofrito-image.py <input.jpg>
"""
import sys
from pathlib import Path
from PIL import Image


def remove_white_background(input_path: Path, output_path: Path, threshold: int = 245):
    """Carrega JPG, torna pixels quase-brancos transparentes, salva como PNG."""
    img = Image.open(input_path).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    transparent = 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (255, 255, 255, 0)
                transparent += 1
    total = w * h
    pct = 100 * transparent / total if total else 0
    img.save(output_path, "PNG", optimize=True)
    print(f"  {output_path.name}: {w}x{h}, {transparent} pixels transparentes ({pct:.1f}%)")


def main():
    if len(sys.argv) < 2:
        print("Uso: python process-cofrito-image.py <input.jpg>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"Arquivo nao encontrado: {input_path}")
        sys.exit(1)

    out_dir = Path(__file__).parent.parent / "frontend" / "src" / "assets" / "cofrito"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Processando {input_path} -> {out_dir}")

    # Mascote principal (mestre, alta qualidade)
    master = out_dir / "cofrito.png"
    remove_white_background(input_path, master)

    # Cópia pra cada "estado" — o widget troca entre elas no avatar
    # Por enquanto, mesmo desenho (a UI pode animar depois)
    for name in ("cofrito-200.png", "cofrito-thinking.png", "cofrito-error.png"):
        remove_white_background(input_path, out_dir / name)

    # FAB menor (64x64) pra usar no botao flutuante
    fab = out_dir / "cofrito-fab.png"
    img = Image.open(master).convert("RGBA")
    img.thumbnail((64, 64), Image.LANCZOS)
    img.save(fab, "PNG", optimize=True)
    print(f"  {fab.name}: thumbnail {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
