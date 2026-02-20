# 1. Use an official Python runtime as a parent image
FROM python:3.11-slim

# 2. Set the working directory in the container
WORKDIR /app

# 3. Install system dependencies for Matplotlib/OpenCV
RUN apt-get update && apt-get install -y \
    libpng-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

# 4. Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy the entire backend project
COPY . .

# 6. Set the PYTHONPATH so 'app' is recognized as a package
ENV PYTHONPATH=/app

# 7. Expose the port FastAPI runs on
EXPOSE 8000

# 8. Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]