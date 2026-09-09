import { Link } from "@tanstack/react-router";
import useBoardStore from "@/store/board";

type LogoProps = {
  className?: string;
};

export function Logo({ className = "" }: LogoProps) {
  const { setBoard } = useBoardStore();

  return (
    <Link
      onClick={() => {
        setBoard(undefined);
      }}
      to="/dashboard"
      className={`w-auto ${className}`}
    >
      <img
        src="/logo-dark.svg"
        alt="Kaneo"
        className="h-6 w-auto dark:hidden"
      />
      <img
        src="/logo-light.svg"
        alt="Kaneo"
        className="hidden h-6 w-auto dark:block"
      />
    </Link>
  );
}
