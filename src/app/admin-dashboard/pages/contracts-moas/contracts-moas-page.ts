import { Component } from '@angular/core';

@Component({
  selector: 'app-contracts-moas-page',
  standalone: true,
  template: `
    <main class="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <section class="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
        <p class="text-xs font-bold uppercase tracking-[0.35em] text-blue-600">Admin page</p>
        <h1 class="mt-4 text-4xl font-extrabold tracking-tight text-slate-900">Contracts &amp; MOAs</h1>
        <p class="mt-4 text-sm leading-6 text-slate-500">This page loaded successfully through Angular routing.</p>
      </section>
    </main>
  `,
})
export class ContractsMoasPageComponent {}
