"""HTTP Basic Auth para proteção de produção.

Quando ORC_USERNAME e ORC_PASSWORD estão setados (via env), todas as rotas que
usarem `Depends(authenticate)` exigem credenciais.

Quando NÃO estão setados (dev local), o middleware é no-op — autoriza todo
mundo. Isso preserva o fluxo de desenvolvimento existente sem auth.
"""
import os
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

_security = HTTPBasic(auto_error=False)


def _expected() -> tuple[str, str] | None:
    user = os.getenv("ORC_USERNAME")
    pwd = os.getenv("ORC_PASSWORD")
    if user and pwd:
        return user, pwd
    return None


def authenticate(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(_security)],
) -> str:
    expected = _expected()
    if expected is None:
        # Dev mode: auth desligada. Útil para rodar local sem pop-up.
        return "anonymous"

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais ausentes.",
            headers={"WWW-Authenticate": 'Basic realm="orcamento"'},
        )

    expected_user, expected_pwd = expected
    user_ok = secrets.compare_digest(credentials.username, expected_user)
    pwd_ok = secrets.compare_digest(credentials.password, expected_pwd)
    if not (user_ok and pwd_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas.",
            headers={"WWW-Authenticate": 'Basic realm="orcamento"'},
        )
    return credentials.username
