"""Recipe schemas: a recipe is a named snapshot of a model's full configuration."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from .models import CreateModelRequest


class RecipeItem(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    model_id: Optional[int] = None
    model_name: str
    served_model_name: str
    task: str
    engine_type: str
    mode: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RecipeDetail(RecipeItem):
    """Identity plus every configuration field, flattened so the UI can prefill the model form."""
    repo_id: Optional[str] = None
    local_path: Optional[str] = None
    config: dict[str, Any]


class CreateRecipeRequest(CreateModelRequest):
    """Same shape as creating a model, plus recipe name/description."""
    recipe_name: str
    description: Optional[str] = None
    name: str = ""
    served_model_name: str = ""


class UpdateRecipeRequest(BaseModel):
    recipe_name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class RecipeFromModelRequest(BaseModel):
    name: str
    description: Optional[str] = None
