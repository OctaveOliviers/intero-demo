from pydantic import BaseModel


class GenerateRequest(BaseModel):
    """A free-text description of the data the user wants generated.

    For now this just relays the prompt to the LLM and streams the response back;
    workbook creation/population is a future step.
    """

    query: str
