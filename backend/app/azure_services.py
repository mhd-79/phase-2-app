import os
import logging
from typing import Optional

logger = logging.getLogger("azure_services")

# Azure Blob Storage Helper
def upload_file_to_blob(container_name: str, blob_name: str, data: bytes) -> Optional[str]:
    conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not conn_str:
        logger.warning("AZURE_STORAGE_CONNECTION_STRING not set; skipping blob upload.")
        return None
    try:
        from azure.storage.blob import BlobServiceClient
        service_client = BlobServiceClient.from_connection_string(conn_str)
        container_client = service_client.get_container_client(container_name)
        if not container_client.exists():
            container_client.create_container()
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(data, overwrite=True)
        return blob_client.url
    except Exception as e:
        logger.error(f"Failed to upload blob {blob_name}: {e}")
        return None

# Azure Key Vault Secret Retrieval
def get_keyvault_secret(secret_name: str) -> Optional[str]:
    keyvault_url = os.getenv("AZURE_KEYVAULT_URL")
    if not keyvault_url:
        return os.getenv(secret_name)
    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient
        credential = DefaultAzureCredential()
        client = SecretClient(vault_url=keyvault_url, credential=credential)
        secret = client.get_secret(secret_name)
        return secret.value
    except Exception as e:
        logger.error(f"Failed to get secret {secret_name} from KeyVault: {e}")
        return os.getenv(secret_name)

# Azure Monitor / Application Insights Logger Configuration
def setup_azure_monitor_logging():
    instrumentation_key = os.getenv("APPINSIGHTS_INSTRUMENTATIONKEY")
    if instrumentation_key:
        try:
            from opencensus.ext.azure.log_exporter import AzureLogHandler
            logger.addHandler(AzureLogHandler(connection_string=f"InstrumentationKey={instrumentation_key}"))
            logger.info("Azure Monitor Application Insights logging enabled.")
        except Exception as e:
            logger.error(f"Failed to setup Azure Monitor logging: {e}")
