import type { Page } from '@playwright/test'

export async function navigateSection(page: Page, name: string) {
  if (await page.locator('.study-focus-shell').count()) await page.getByRole('button', { name: 'Volver al material o curso' }).click()
  if (page.viewportSize()!.width <= 700) await page.getByRole('button', { name: 'Abrir navegación' }).click()
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name, exact: true }).click()
}

export async function selectStudyMode(page: Page, name: string) {
  if (await page.locator('.study-focus-shell').count()) {
    await page.getByRole('button', { name: 'Opciones de estudio' }).click()
    await page.getByRole('menuitem', { name, exact: true }).click()
  } else await page.getByRole('button', { name, exact: true }).click()
}

export async function openWorkspaceNavigation(page: Page) {
  if (page.viewportSize()!.width <= 700 && !await page.locator('.app-shell').evaluate(node => node.classList.contains('mobile-sidebar-open'))) await page.getByRole('button', { name: 'Abrir navegación' }).click()
  await page.getByRole('button', { name: /Cambiar espacio de estudio/ }).click()
}
