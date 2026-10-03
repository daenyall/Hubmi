import os
import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    port = int(os.environ.get("PORT", settings.PORT))
    is_dev = settings.ENVIRONMENT == "development"
    workers = int(os.environ.get("WEB_CONCURRENCY", os.environ.get("WORKERS", settings.WORKERS)))

    if is_dev:
        uvicorn.run(
            "app.main:app",
            host=settings.HOST,
            port=port,
            reload=True,
        )
    else:
        uvicorn.run(
            "app.main:app",
            host=settings.HOST,
            port=port,
            reload=False,
            workers=workers,
            proxy_headers=True,
            forwarded_allow_ips="*",
        )
