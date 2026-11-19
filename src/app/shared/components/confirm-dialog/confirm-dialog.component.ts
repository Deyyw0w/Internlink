import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="open()"
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      (click)="cancel.emit()"
    >
      <div
        class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 flex flex-col"
        (click)="$event.stopPropagation()"
      >
        <div class="p-6 border-b border-slate-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                <title>delete-outline</title>
                <path fill="currentColor" d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21zM17 6H7v13h10zM9 17h2V8H9zm4 0h2V8h-2zM7 6v13z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-bold text-slate-900">{{ title() }}</h3>
              <p class="text-xs text-slate-500 mt-1" [innerHTML]="message()"></p>
            </div>
          </div>
          <button
            type="button"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            (click)="cancel.emit()"
            aria-label="Close"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6 text-center">
          <div class="flex justify-center gap-3">
            <button
              type="button"
              [disabled]="loading()"
              class="px-5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold text-sm bg-white hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              (click)="cancel.emit()"
            >
              {{ cancelLabel() }}
            </button>
            <button
              type="button"
              [disabled]="loading()"
              class="px-5 py-2 rounded-lg bg-rose-600 text-white font-semibold text-sm hover:bg-rose-700 transition-colors shadow-[0_4px_6px_-1px_rgba(215,29,54,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
              (click)="confirm.emit()"
            >
              <span *ngIf="!loading()">{{ confirmLabel() }}</span>
              <span *ngIf="loading()" class="flex items-center justify-center gap-2">
                <svg
                  class="w-4 h-4 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {{ loadingLabel() }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class ConfirmDialogComponent {
  readonly open = input<boolean>(false);
  readonly title = input<string>('Confirm Action');
  readonly message = input<string>('Are you sure you want to proceed?');
  readonly confirmLabel = input<string>('Confirm');
  readonly cancelLabel = input<string>('Cancel');
  readonly loading = input<boolean>(false);
  readonly loadingLabel = input<string>('Deleting…');

  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
