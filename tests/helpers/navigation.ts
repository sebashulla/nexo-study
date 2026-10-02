import type { Page } from '@playwright/test'

export async function navigateSection(page: Page, name: string) {
  if (page.viewportSize()!.width <= 700) await page.getByRole('button', { name: 'Abrir navegación' }).click()
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name, exact: true }).click()
}
