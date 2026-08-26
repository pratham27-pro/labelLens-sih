import io
import time
import base64
import logging
from typing import Union, List, Optional
import cv2
import numpy as np
from PIL import Image, ImageDraw
from rapidocr_onnxruntime import RapidOCR

from schemas.ocr import (
    OCRScanResult,
    TextBlock,
    ImageMetadata,
    BBox,
    BlockSize,
    Point
)

logger = logging.getLogger("ocr_service")

class OCRService:
    def __init__(self):
        """
        Initialize RapidOCR engine running on ONNXRuntime CPU.
        Runs smoothly on standard laptops without GPU requirements.
        """
        try:
            self.engine = RapidOCR()
            logger.info("RapidOCR engine initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize RapidOCR engine: {e}")
            raise RuntimeError(f"OCR Engine initialization error: {e}")

    def preprocess_image(self, img_np: np.ndarray, enhance: bool = True) -> tuple[np.ndarray, float]:
        """
        Applies image preprocessing & auto-upscaling for low-resolution label photos.
        Returns:
            processed_img: preprocessed numpy image array
            scale_factor: scale multiplier (e.g. 2.0 if image was upscaled 2x)
        """
        height, width = img_np.shape[0], img_np.shape[1]
        scale_factor = 1.0

        # Auto-upscale low resolution images (width < 800px) so small text is readable by OCR
        if width < 800 or height < 800:
            scale_factor = 2.5 if width < 400 else 2.0
            new_w = int(width * scale_factor)
            new_h = int(height * scale_factor)
            img_np = cv2.resize(img_np, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

        if len(img_np.shape) == 2:  # Grayscale
            img_np = cv2.cvtColor(img_np, cv2.COLOR_GRAY2RGB)
        elif img_np.shape[2] == 4:  # RGBA
            img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2RGB)

        if enhance:
            # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
            lab = cv2.cvtColor(img_np, cv2.COLOR_RGB2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            limg = cv2.merge((cl, a, b))
            img_np = cv2.cvtColor(limg, cv2.COLOR_LAB2RGB)

            # Apply mild sharpening kernel
            kernel = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]])
            img_np = cv2.filter2D(img_np, -1, kernel)

        return img_np, scale_factor

    def load_image(self, image_input: Union[str, bytes, Image.Image, np.ndarray]) -> tuple[np.ndarray, ImageMetadata]:
        """
        Normalizes any supported image input into numpy RGB array and ImageMetadata.
        """
        if isinstance(image_input, str):
            pil_img = Image.open(image_input).convert("RGB")
            img_np = np.array(pil_img)
        elif isinstance(image_input, bytes):
            pil_img = Image.open(io.BytesIO(image_input)).convert("RGB")
            img_np = np.array(pil_img)
        elif isinstance(image_input, Image.Image):
            pil_img = image_input.convert("RGB")
            img_np = np.array(pil_img)
        elif isinstance(image_input, np.ndarray):
            img_np = image_input
            if len(img_np.shape) == 2:
                img_np = cv2.cvtColor(img_np, cv2.COLOR_GRAY2RGB)
            elif img_np.shape[2] == 4:
                img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2RGB)
        else:
            raise ValueError(f"Unsupported image input type: {type(image_input)}")

        height, width = img_np.shape[0], img_np.shape[1]
        channels = img_np.shape[2] if len(img_np.shape) > 2 else 1
        metadata = ImageMetadata(width=width, height=height, channels=channels)

        return img_np, metadata

    def extract_text(
        self,
        image_input: Union[str, bytes, Image.Image, np.ndarray],
        enhance: bool = False,
        min_confidence: float = 0.3,
        include_annotated_image: bool = False
    ) -> OCRScanResult:
        """
        Main OCR extraction function.
        Reads label photo and returns every text block found with:
        - text content
        - confidence score
        - position (polygon & bounding box adjusted back to original image scale)
        - size (width, height, aspect ratio, estimated font size in pixels)
        """
        start_time = time.time()
        try:
            img_np, metadata = self.load_image(image_input)
            
            processed_img, scale_factor = self.preprocess_image(img_np, enhance=enhance)

            # Perform OCR using RapidOCR
            ocr_result, elapse = self.engine(processed_img)

            text_blocks: List[TextBlock] = []
            raw_lines: List[str] = []

            if ocr_result:
                for idx, item in enumerate(ocr_result):
                    box, text, score = item[0], item[1], float(item[2])

                    if score < min_confidence or not text.strip():
                        continue

                    # Adjust box coordinates back to original image scale
                    polygon = [[float(pt[0]) / scale_factor, float(pt[1]) / scale_factor] for pt in box]
                    
                    xs = [pt[0] for pt in polygon]
                    ys = [pt[1] for pt in polygon]
                    
                    x_min, x_max = float(min(xs)), float(max(xs))
                    y_min, y_max = float(min(ys)), float(max(ys))
                    
                    width = max(x_max - x_min, 1.0)
                    height = max(y_max - y_min, 1.0)
                    aspect_ratio = round(width / height, 2)
                    
                    font_size_px = round(height, 1)

                    center_x = round((x_min + x_max) / 2.0, 1)
                    center_y = round((y_min + y_max) / 2.0, 1)

                    block = TextBlock(
                        id=idx + 1,
                        text=text.strip(),
                        confidence=round(score, 4),
                        polygon=polygon,
                        bbox=BBox(
                            x_min=round(x_min, 1),
                            y_min=round(y_min, 1),
                            x_max=round(x_max, 1),
                            y_max=round(y_max, 1)
                        ),
                        size=BlockSize(
                            width=round(width, 1),
                            height=round(height, 1),
                            aspect_ratio=aspect_ratio,
                            estimated_font_size_px=font_size_px
                        ),
                        center=Point(x=center_x, y=center_y)
                    )
                    text_blocks.append(block)
                    raw_lines.append(text.strip())

            processing_time = round((time.time() - start_time) * 1000, 2)
            raw_text = "\n".join(raw_lines)

            annotated_b64 = None
            if include_annotated_image:
                annotated_b64 = self.generate_annotated_image(img_np, text_blocks)

            return OCRScanResult(
                success=True,
                image_metadata=metadata,
                total_text_blocks=len(text_blocks),
                text_blocks=text_blocks,
                raw_text=raw_text,
                processing_time_ms=processing_time,
                annotated_image_base64=annotated_b64
            )

        except Exception as e:
            logger.error(f"Error during OCR extraction: {e}", exc_info=True)
            processing_time = round((time.time() - start_time) * 1000, 2)
            return OCRScanResult(
                success=False,
                image_metadata=ImageMetadata(width=0, height=0, channels=0),
                total_text_blocks=0,
                text_blocks=[],
                raw_text="",
                processing_time_ms=processing_time,
                error=str(e)
            )

    def generate_annotated_image(self, img_np: np.ndarray, text_blocks: List[TextBlock]) -> str:
        """
        Draws bounding boxes, text labels, and font sizes on the image for visual verification.
        Returns base64 encoded JPEG image string.
        """
        pil_img = Image.fromarray(img_np).convert("RGBA")
        overlay = Image.new("RGBA", pil_img.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)

        for block in text_blocks:
            pts = [(pt[0], pt[1]) for pt in block.polygon]
            draw.polygon(pts, outline=(0, 102, 204, 255), fill=(0, 102, 204, 40))
            
            x_min, y_min = block.bbox.x_min, block.bbox.y_min
            label = f"#{block.id} {block.text} ({block.size.estimated_font_size_px}px)"
            draw.text((x_min, max(0, y_min - 14)), label, fill=(255, 0, 0, 255))

        combined = Image.alpha_composite(pil_img, overlay).convert("RGB")
        buffered = io.BytesIO()
        combined.save(buffered, format="JPEG", quality=85)
        return base64.b64encode(buffered.getvalue()).decode("utf-8")


# Module-level singleton instance
_ocr_service_instance: Optional[OCRService] = None

def get_ocr_service() -> OCRService:
    global _ocr_service_instance
    if _ocr_service_instance is None:
        _ocr_service_instance = OCRService()
    return _ocr_service_instance

def extract_text_from_image(
    image_input: Union[str, bytes, Image.Image, np.ndarray],
    enhance: bool = False,
    min_confidence: float = 0.3,
    include_annotated_image: bool = False
) -> OCRScanResult:
    service = get_ocr_service()
    return service.extract_text(
        image_input,
        enhance=enhance,
        min_confidence=min_confidence,
        include_annotated_image=include_annotated_image
    )
