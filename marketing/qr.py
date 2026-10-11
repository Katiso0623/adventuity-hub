"""Writes marketing/qr.svg for the booking link.  python3 marketing/qr.py [url]"""
import os, sys
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderSVG
url = sys.argv[1] if len(sys.argv) > 1 else 'https://katiso0623.github.io/adventuity-hub/'
w = QrCodeWidget(url, barLevel='M'); w.barWidth = w.barHeight = 600; w.x = w.y = 0
d = Drawing(600, 600); d.add(w)
renderSVG.drawToFile(d, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qr.svg'))
print('QR for', url)
