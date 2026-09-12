import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("renderiza os children corretamente", () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
  });

  it("aplica a classe do variant default por padrão", () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-primary");
  });

  it("aplica a classe do variant outline quando informado", () => {
    render(<Button variant="outline">Cancelar</Button>);
    expect(screen.getByRole("button")).toHaveClass("border-border");
  });

  it("dispara onClick ao ser clicado", async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Clique</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("não dispara onClick quando disabled", async () => {
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Clique
      </Button>
    );
    expect(screen.getByRole("button")).toBeDisabled();
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
