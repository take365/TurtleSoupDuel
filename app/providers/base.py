from abc import ABC, abstractmethod
from typing import Dict, Any


class LLMProvider(ABC):
    @abstractmethod
    def ask_mc_judge(self, theme: Dict[str, Any], history: list, question: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    def ask_mc_verify(self, theme: Dict[str, Any], guess: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    def ai_generate_question(self, theme: Dict[str, Any], history: list) -> Dict[str, Any]:
        ...

    @abstractmethod
    def ai_generate_guess(self, theme: Dict[str, Any], history: list) -> Dict[str, Any]:
        ...

