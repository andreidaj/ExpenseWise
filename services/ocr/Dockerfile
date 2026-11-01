FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 libgfortran5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN pip install --no-cache-dir paddlepaddle==2.6.2 paddleocr==2.7.3 \
    && pip install --no-cache-dir "numpy<2"

COPY app.py .

# Modelele se descarcă o dată la build, nu la prima poză a utilizatorului.
RUN python -c "from PIL import Image; Image.new('RGB',(64,64),'white').save('/tmp/warm.jpg'); from app import _paddle_text; _paddle_text(open('/tmp/warm.jpg','rb').read())"

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
