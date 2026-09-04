FROM python:3.12-slim
WORKDIR /app
COPY . /app
ENV PORT=8073
EXPOSE 8073
VOLUME ["/app/data"]
CMD ["python3", "app.py", "--host", "0.0.0.0"]
