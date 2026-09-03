export interface ActivatableCampaign {
  keyword: string;
  assetName: string;
  assetUrl: string;
  deliveryMessage: string;
  instagramMediaId: string | null;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Mirrors findApprovalBlockers' shape (src/lib/validation/postApproval.ts):
// pure, DB-free, returns every reason at once. "Não permita ativar uma
// campanha sem..." from the dashboard brief.
export function findCampaignActivationBlockers(campaign: ActivatableCampaign, postStatus: string): string[] {
  const blockers: string[] = [];

  if (!campaign.keyword.trim()) {
    blockers.push('A campanha não tem palavra-chave.');
  }
  if (!campaign.assetName.trim()) {
    blockers.push('A campanha não tem material definido.');
  }
  if (!campaign.assetUrl.trim() || !isValidUrl(campaign.assetUrl)) {
    blockers.push('A URL do material não é válida.');
  }
  if (!campaign.deliveryMessage.trim()) {
    blockers.push('A campanha não tem mensagem de entrega.');
  }
  if (postStatus === 'published' && !campaign.instagramMediaId) {
    blockers.push('O post já foi publicado, mas a campanha não está vinculada ao ID da mídia no Instagram.');
  }

  return blockers;
}
