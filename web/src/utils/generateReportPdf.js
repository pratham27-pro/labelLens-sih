// Renders a DOM node into a paginated, pixel-faithful A4 PDF.
// Used by the report modal so the downloaded PDF is an exact snapshot of the
// on-screen preview (same layout, colors, badges, images) — the sliced pages
// follow the report's own structure, so nothing breaks mid-section.

// Keep the capture canvas under ~30MP (memory safety on mobile devices) while
// preferring 2x for crisp text.
const MAX_CANVAS_AREA = 30_000_000;

export async function generatePdfFromElement(element, filename) {
  if (!element) throw new Error('Report is not ready yet.');

  // Dynamic imports: jspdf + html2canvas-pro are heavy and only needed on
  // download, so they stay out of the main bundle (Vite code-splits them).
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas-pro'),
  ]);

  // Capture from an off-screen clone: the preview lives inside a scrollable
  // modal (content taller than the viewport would be clipped), and dynamic
  // nodes like the error banner must not appear in the PDF.
  const holder = document.createElement('div');
  holder.style.cssText =
    'position:fixed;left:-10000px;top:0;background:#ffffff;z-index:-1;';
  holder.style.width = `${Math.max(element.scrollWidth, element.offsetWidth)}px`;
  const clone = element.cloneNode(true);
  clone.querySelectorAll('.no-print').forEach((node) => node.remove());
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    const area = Math.max(1, holder.offsetWidth * holder.scrollHeight);
    const scale = Math.min(2, Math.max(1, Math.sqrt(MAX_CANVAS_AREA / area)));
    const canvas = await html2canvas(holder, {
      useCORS: true, // Cloudinary evidence images allow cross-origin reads
      backgroundColor: '#ffffff',
      logging: false,
      scale,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = 210;
    const pageH = 297;
    const margin = 8;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    // Height of one A4 content area expressed in capture-canvas pixels.
    const sliceSourceH = Math.ceil((contentH * canvas.width) / contentW);
    const pages = Math.max(1, Math.ceil(canvas.height / sliceSourceH));

    for (let page = 0; page < pages; page += 1) {
      if (page > 0) pdf.addPage();
      const srcY = page * sliceSourceH;
      const srcH = Math.min(sliceSourceH, canvas.height - srcY);

      // Slice the tall canvas once per page so each page embeds only its own
      // region (keeps the PDF small and every page clean).
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = srcH;
      const ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        margin,
        margin,
        contentW,
        (srcH * contentW) / canvas.width,
        undefined,
        'FAST'
      );
    }

    pdf.save(filename);
  } finally {
    holder.remove();
  }
}
