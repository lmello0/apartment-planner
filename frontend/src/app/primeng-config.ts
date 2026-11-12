import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Aura with a deep green primary (matches --accent in styles.scss). */
export const AppPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef6f2', 100: '#d6e9e0', 200: '#aed3c3', 300: '#7fb8a2', 400: '#4e9a7e',
      500: '#2f7d62', 600: '#1f5a47', 700: '#1a4c3c', 800: '#163e32', 900: '#12332a', 950: '#0a1f19',
    },
  },
});

export const PT_BR = {
  firstDayOfWeek: 0,
  dayNames: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  dayNamesShort: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  dayNamesMin: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  monthNames: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  monthNamesShort: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  today: 'Hoje',
  clear: 'Limpar',
  weekHeader: 'Sem',
  dateFormat: 'dd/mm/yy',
  accept: 'Sim',
  reject: 'Não',
  choose: 'Escolher',
  cancel: 'Cancelar',
  emptyMessage: 'Nenhum resultado',
  emptyFilterMessage: 'Nenhum resultado',
};
