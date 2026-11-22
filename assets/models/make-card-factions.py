"""4陣営専用3Dカードフレーム（王国・森林・魔族・竜族）を一括生成する。

実行:
  blender --background --python assets/models/make-card-factions.py
"""
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SCRIPTS = [
    'make-card-faction-kingdom',
    'make-card-faction-forest',
    'make-card-faction-demon',
    'make-card-faction-dragon',
]


def main():
    for name in SCRIPTS:
        mod = importlib.import_module(name)
        mod.build()


if __name__ == '__main__':
    main()
