"""
URL Validation

Uses the validators package for URL validation.
SSRF protection is handled by safehttpx at the network layer.
"""

from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import validators


MAX_URL_LENGTH = 2048


@dataclass
class UrlValidationResult:
    """Result of URL validation."""
    valid: bool
    error: Optional[str] = None
    normalized_url: Optional[str] = None


def validate_url(url_string: str) -> UrlValidationResult:
    """
    Validate and normalize a URL for the audit.
    
    Args:
        url_string: The URL to validate
        
    Returns:
        UrlValidationResult with validation status and normalized URL
    """
    trimmed = url_string.strip()
    
    if not trimmed:
        return UrlValidationResult(valid=False, error="URL is required")
    
    if len(trimmed) > MAX_URL_LENGTH:
        return UrlValidationResult(
            valid=False, 
            error="URL is too long (max 2048 characters)"
        )
    
    # Check for credentials in URL
    if "@" in trimmed:
        try:
            parsed = urlparse(trimmed if "://" in trimmed else f"https://{trimmed}")
            if parsed.username or parsed.password:
                return UrlValidationResult(
                    valid=False, 
                    error="URLs with credentials are not allowed"
                )
        except Exception:
            pass
    
    # Add https:// if no protocol
    has_protocol = trimmed.startswith(("http://", "https://"))
    normalized_url = trimmed if has_protocol else f"https://{trimmed}"
    
    # Check for non-HTTP schemes
    if "://" in trimmed and not has_protocol:
        return UrlValidationResult(
            valid=False,
            error="Invalid URL scheme. Only HTTP and HTTPS are allowed."
        )
    
    # Validate with validators package
    if not validators.url(normalized_url):
        return UrlValidationResult(valid=False, error="Invalid URL format")
    
    return UrlValidationResult(valid=True, normalized_url=normalized_url)


def validate_url_or_raise(url_string: str) -> str:
    """
    Validate and normalize a URL, raising an error if invalid.
    
    Args:
        url_string: The URL to validate
        
    Returns:
        The normalized URL
        
    Raises:
        ValueError: If the URL is invalid
    """
    result = validate_url(url_string)
    if not result.valid:
        raise ValueError(result.error)
    return result.normalized_url
