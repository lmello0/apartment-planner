import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * "Casa nova": olive primary on warm clay/linen surfaces. Built on Aura's component structure,
 * with its own palette, radii and tokens (mirrors the CSS custom properties in styles.scss).
 */
export const AppPreset = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '3px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  },
  semantic: {
    primary: {
      50: '#f4f6e8', 100: '#e5ebc6', 200: '#cfd99b', 300: '#b3c06c', 400: '#98a84a',
      500: '#7c8c33', 600: '#5f6f25', 700: '#4c5a1f', 800: '#3d481c', 900: '#323b19', 950: '#1b2109',
    },
    formField: { borderRadius: '8px' },
    colorScheme: {
      light: {
        surface: {
          0: '#fffdf8', 50: '#faf5ec', 100: '#f4ede3', 200: '#e8dccb', 300: '#d9c9b2', 400: '#b5a58e',
          500: '#8f8171', 600: '#6f6252', 700: '#554a3d', 800: '#3d342a', 900: '#2a2118', 950: '#1a140e',
        },
        primary: {
          color: '{primary.700}', contrastColor: '#ffffff', hoverColor: '{primary.800}', activeColor: '{primary.900}',
        },
        highlight: {
          background: '{primary.100}', focusBackground: '{primary.200}', color: '{primary.900}', focusColor: '{primary.950}',
        },
        formField: { borderColor: '{surface.500}', hoverBorderColor: '{surface.600}', placeholderColor: '{surface.600}' },
      },
      dark: {
        surface: {
          0: '#ffffff', 50: '#f3ece0', 100: '#e2d8c7', 200: '#c7bba7', 300: '#a99d89', 400: '#877c6b',
          500: '#665c4e', 600: '#4a4237', 700: '#382f26', 800: '#2a231c', 900: '#1f1a15', 950: '#14100d',
        },
        primary: {
          color: '{primary.300}', contrastColor: '#1b2109', hoverColor: '{primary.200}', activeColor: '{primary.100}',
        },
        highlight: {
          background: 'color-mix(in srgb, {primary.400}, transparent 80%)',
          focusBackground: 'color-mix(in srgb, {primary.400}, transparent 70%)',
          color: 'rgba(255,255,255,.92)', focusColor: '#ffffff',
        },
        formField: { borderColor: '{surface.400}', hoverBorderColor: '{surface.300}', placeholderColor: '{surface.300}' },
      },
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
