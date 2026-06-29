import { useEffect, useState } from "react"

export type AuthTheme = "light" | "dark"

const storageKey = "vdt-ui-theme"

function getInitialTheme(): AuthTheme {
  const storedTheme = window.localStorage.getItem(storageKey)
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme
  }

  return "light"
}

export function useAuthTheme() {
  const [theme, setTheme] = useState<AuthTheme>(getInitialTheme)

  useEffect(() => {
    window.localStorage.setItem(storageKey, theme)
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))
  }

  return { theme, toggleTheme }
}
