import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { diffDays, isoToPicker, localTodayIso, pickerToIso } from '../../core/dates';
import { PHASE_LABEL, PHASE_ORDER, enumOptions } from '../../core/labels';
import { TaskDto, TaskInput, TaskPhase } from '../../core/models';
import { ActionsService } from '../../shared/actions.service';
import { FeedbackService } from '../../shared/feedback.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DateBrPipe } from '../../shared/pipes';

type View = 'OPEN' | 'DONE' | 'ALL';

@Component({
  selector: 'app-tasks-page',
  imports: [
    FormsModule, ReactiveFormsModule, ButtonModule, CheckboxModule, DatePickerModule, DialogModule, InputTextModule,
    SelectModule, SelectButtonModule, TagModule, TextareaModule, PageHeaderComponent, DateBrPipe,
  ],
  templateUrl: './tasks.page.html',
  styleUrl: './tasks.page.scss',
})
export class TasksPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly actions = inject(ActionsService);
  private readonly feedback = inject(FeedbackService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly phaseLabel = PHASE_LABEL;
  protected readonly phases = enumOptions<TaskPhase>(PHASE_LABEL);
  protected readonly views: { label: string; value: View }[] = [
    { label: 'Abertas', value: 'OPEN' },
    { label: 'Concluídas', value: 'DONE' },
    { label: 'Todas', value: 'ALL' },
  ];

  protected readonly tasks = signal<TaskDto[] | null>(null);
  protected readonly view = signal<View>('OPEN');
  protected readonly dialogOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly groups = computed(() => {
    const all = this.tasks() ?? [];
    const v = this.view();
    const visible = all.filter((t) => v === 'ALL' || (v === 'OPEN' ? !t.doneAt : !!t.doneAt));
    return PHASE_ORDER.map((phase) => ({
      phase,
      items: visible
        .filter((t) => t.phase === phase)
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
      open: all.filter((t) => t.phase === phase && !t.doneAt).length,
    })).filter((g) => g.items.length > 0);
  });

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    phase: ['PRE_CONTRACT' as TaskPhase, Validators.required],
    dueDate: [null as Date | null],
    notes: [''],
  });

  ngOnInit(): void {
    this.load();
    this.actions.changed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  protected toggle(t: TaskDto): void {
    this.actions.toggleTask(t);
  }

  protected deadline(t: TaskDto): { text: string; late: boolean } | null {
    if (!t.dueDate) return null;
    const d = diffDays(localTodayIso(), t.dueDate);
    const late = d < 0 && !t.doneAt;
    return { text: late ? `atrasada ${-d} dia(s)` : d === 0 ? 'hoje' : d > 0 && d <= 14 ? `em ${d} dia(s)` : '', late };
  }

  protected openNew(): void {
    this.editingId.set(null);
    this.form.reset({ title: '', phase: 'PRE_CONTRACT', dueDate: null, notes: '' });
    this.dialogOpen.set(true);
  }

  protected openEdit(t: TaskDto): void {
    this.editingId.set(t.id);
    this.form.reset({ title: t.title, phase: t.phase, dueDate: isoToPicker(t.dueDate), notes: t.notes ?? '' });
    this.dialogOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const current = this.editingId() ? this.tasks()?.find((t) => t.id === this.editingId()) : undefined;
    const input: TaskInput = {
      title: v.title.trim(), phase: v.phase, dueDate: pickerToIso(v.dueDate), notes: v.notes.trim() || null,
      obligationId: current?.obligationId ?? null, installmentId: current?.installmentId ?? null,
      doneAt: current?.doneAt ?? null,
    };
    this.saving.set(true);
    const req = current ? this.api.updateTask(current.id, input) : this.api.createTask(input);
    req.subscribe({
      next: (t) => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.feedback.success(current ? 'Tarefa atualizada' : 'Tarefa criada', t.title);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  protected confirmDelete(t: TaskDto): void {
    this.confirm.confirm({
      key: 'app',
      header: 'Excluir tarefa?',
      message: `"${t.title}" será removida da lista.`,
      icon: 'pi pi-trash',
      acceptLabel: 'Excluir',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.api.deleteTask(t.id).subscribe(() => {
          this.feedback.success('Tarefa excluída', t.title);
          this.load();
        }),
    });
  }

  private load(): void {
    this.api.tasks().subscribe((t) => this.tasks.set(t));
  }
}
