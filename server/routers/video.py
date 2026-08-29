import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from services.video_processing import DominantCuboidUnwrapper

router = APIRouter(
    prefix="/api/v1/video",
    tags=["Video Processing"],
)

SERVER_DIR = Path(__file__).resolve().parents[1]
VIDEO_OUTPUT_DIR = SERVER_DIR / "video_outputs"

_unwrapper = None


def get_unwrapper():
    global _unwrapper

    if _unwrapper is None:
        _unwrapper = DominantCuboidUnwrapper()

    return _unwrapper


def process_video(video_path: str, output_dir: str):
    return get_unwrapper().unwrap_video(video_path, output_dir)


@router.post("/frames")
async def video_to_frames(file: UploadFile = File(...)):
    filename = file.filename or "upload.mp4"
    extension = Path(filename).suffix.lower()

    allowed_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported video format.",
        )

    video_bytes = await file.read()

    if not video_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded video is empty.",
        )

    request_id = str(uuid4())
    output_dir = VIDEO_OUTPUT_DIR / request_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # The input video only needs to exist while processing.
    with tempfile.TemporaryDirectory() as temp_dir:
        video_path = Path(temp_dir) / f"input{extension}"
        video_path.write_bytes(video_bytes)

        try:
            image_paths = await run_in_threadpool(
                process_video,
                str(video_path),
                str(output_dir),
            )
        except Exception as error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Video processing failed: {error}",
            )

    if not image_paths:
        output_dir.rmdir()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No label faces were detected in the video.",
        )

    return {
        "request_id": request_id,
        "folder": str(output_dir),
        "images": [
            {
                "filename": Path(image_path).name,
                "url": f"/video-files/{request_id}/{Path(image_path).name}",
            }
            for image_path in image_paths
        ],
    }