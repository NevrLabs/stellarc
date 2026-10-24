import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Timeline, TimelineDate, TimelineItem } from "@/components/ui/timeline";

/**
 * NEVR-171: form.tsx and timeline.tsx were ported off the Radix Slot onto
 * Base UI useRender. These tests pin the Slot contract the port must keep:
 * the control child (not a wrapper element) receives the aria/id props, the
 * child's own props survive, and handlers on the child still fire.
 */

afterEach(cleanup);

function EmailForm() {
  const form = useForm<{ email: string }>({
    defaultValues: { email: "" },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <FormField
          control={form.control}
          name="email"
          rules={{ required: "Email is required" }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <input
                  data-testid="control"
                  placeholder="email"
                  type="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

describe("FormControl (Base UI useRender port of Radix Slot)", () => {
  test("merges control props into the child element, not a wrapper", () => {
    render(<EmailForm />);
    const control = screen.getByTestId("control");
    expect(control.getAttribute("data-slot")).toBe("form-control");
    expect(control.id).toMatch(/-form-item$/);
    expect(control.getAttribute("aria-invalid")).toBe("false");
    // child props survive: placeholder kept, no extra wrapper element
    expect(control).toHaveAttribute("placeholder", "email");
    expect(control.parentElement?.getAttribute("data-slot")).toBe("form-item");
  });

  test("sets aria-describedby (description + message) and aria-invalid on error", async () => {
    render(<EmailForm />);
    const control = screen.getByTestId("control");
    fireEvent.click(control);
    fireEvent.submit(control.closest("form") as HTMLFormElement);
    // validation error surfaces (required) after submit
    await waitFor(() => {
      expect(control.getAttribute("aria-invalid")).toBe("true");
    });
    const describedBy = control.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toMatch(/-form-item-description/);
    expect(describedBy).toMatch(/-form-item-message/);
  });

  test("child event handlers fire (props merge keeps child behavior)", () => {
    const onInput = vi.fn();
    function TypedForm() {
      const form = useForm<{ email: string }>({ defaultValues: { email: "" } });
      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <input
                    data-testid="typed"
                    type="text"
                    onInput={onInput}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </Form>
      );
    }
    render(<TypedForm />);
    fireEvent.input(screen.getByTestId("typed"), {
      target: { value: "hello" },
    });
    expect(onInput).toHaveBeenCalled();
    expect((screen.getByTestId("typed") as HTMLInputElement).value).toBe(
      "hello",
    );
  });
});

describe("TimelineDate (Base UI useRender port of Radix Slot)", () => {
  test("renders a <time> element by default with merged className", () => {
    render(
      <Timeline>
        <TimelineItem step={1}>
          <TimelineDate className="extra-class">Oct 13</TimelineDate>
        </TimelineItem>
      </Timeline>,
    );
    const date = screen.getByText("Oct 13");
    expect(date.tagName).toBe("TIME");
    expect(date.getAttribute("data-slot")).toBe("timeline-date");
    expect(date.className).toContain("extra-class");
    expect(date.className).toContain("text-muted-foreground");
  });

  test("asChild clones the child instead of rendering <time>", () => {
    render(
      <Timeline>
        <TimelineItem step={1}>
          <TimelineDate asChild className="from-slot">
            <span data-testid="child">custom date</span>
          </TimelineDate>
        </TimelineItem>
      </Timeline>,
    );
    const child = screen.getByTestId("child");
    expect(child.getAttribute("data-slot")).toBe("timeline-date");
    expect(child.className).toContain("from-slot");
    expect(child.className).toContain("text-muted-foreground");
    expect(document.querySelector("time")).toBeNull();
  });
});
