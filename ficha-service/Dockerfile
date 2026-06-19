FROM python:3.11-slim

# Instalar LibreOffice e dependências
RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    wget \
    unzip \
    fontconfig \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Instalar Yanone Kaffeesatz
RUN wget -q "https://github.com/google/fonts/raw/main/ofl/yanonekaffeesatz/YanoneKaffeesatz%5Bwght%5D.ttf" \
    -O /usr/share/fonts/truetype/YanoneKaffeesatz.ttf \
    && fc-cache -f -v

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY template.xlsx .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
