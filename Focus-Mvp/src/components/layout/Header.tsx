"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface HeaderProps {
  userName?: string | null;
  orgName?: string | null;
}

export function Header({ userName, orgName }: HeaderProps) {
  const { theme, toggle } = useTheme();
  const router = useRouter();

  const initials = userName
    ? userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <header
      className="h-[52px] flex items-center justify-end px-5 shrink-0 transition-colors duration-200 border-b border-border bg-card/80 glass"
    >
      <div className="flex items-center gap-1.5">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 cursor-pointer"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {theme === "dark"
            ? <Sun className="w-[15px] h-[15px]" />
            : <Moon className="w-[15px] h-[15px]" />
          }
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 rounded-full">
              <Avatar className="h-7 w-7">
                <AvatarFallback
                  className="text-[10px] font-semibold text-white bg-gradient-to-br from-[hsl(214,89%,52%)] to-[hsl(214,80%,38%)]"
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 animate-fade-in-scale">
            <div
              className="px-3 py-2.5 cursor-pointer hover:bg-accent rounded-sm transition-colors"
              onClick={() => router.push("/profile")}
            >
              <p className="text-[13px] font-semibold text-foreground">{userName}</p>
              <p className="text-[11px] mt-0.5 text-muted-foreground">{orgName}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px] gap-2.5 cursor-pointer" onClick={() => router.push("/settings")}>
              <Settings className="h-3.5 w-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[13px] gap-2.5 cursor-pointer text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
