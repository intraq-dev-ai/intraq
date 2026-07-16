import { ref } from 'vue';

export function useManualCardSidebar() {
  return {
    showCardCalcDialog: ref(false),
    showCardColorDialog: ref(false),
    showCardFeaturesDialog: ref(false),
    showCardTitleDialog: ref(false),
    showCardValueDialog: ref(false)
  };
}
