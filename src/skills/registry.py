from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from src.core.logger import logger


class SkillMetadata(BaseModel):
    name: str
    label: str
    description: str
    category: str = "research"  # research, ml, bio, analysis
    parameters_schema: Dict[str, Any] = Field(default_factory=dict)
    returns_schema: Dict[str, Any] = Field(default_factory=dict)


class BaseSkill(ABC):
    """Abstract base class for all scientific and research skills."""

    def __init__(self, metadata: SkillMetadata):
        self.metadata = metadata

    @property
    def name(self) -> str:
        return self.metadata.name

    @abstractmethod
    async def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the skill with provided parameters and return structured result."""
        pass


class SkillRegistry:
    """Central registry and executor for research copilot scientific skills."""

    def __init__(self):
        self._skills: Dict[str, BaseSkill] = {}

    def register(self, skill: BaseSkill) -> None:
        self._skills[skill.name] = skill
        logger.info("[SkillRegistry] Registered skill '%s' (%s)", skill.name, skill.metadata.label)

    def get(self, name: str) -> Optional[BaseSkill]:
        return self._skills.get(name)

    def list_skills(self) -> List[SkillMetadata]:
        return [skill.metadata for skill in self._skills.values()]

    async def execute(self, name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        skill = self.get(name)
        if not skill:
            raise ValueError(f"Skill '{name}' is not registered in SkillRegistry.")
        logger.info("[SkillRegistry] Executing skill '%s' with %d parameters", name, len(params))
        return await skill.execute(params)


# Global singleton skill registry
skill_registry = SkillRegistry()
