export async function loadPlugin(name: string): Promise<void> {
  if (name === 'charts') {
    const mod = await import('./plugins/charts');
    mod.register();
  }
}
