import { describe, expect, test } from 'vitest';
import { findCampaignActivationBlockers, type ActivatableCampaign } from './campaignActivation';

const readyCampaign: ActivatableCampaign = {
  keyword: 'MAPA',
  assetName: 'Mapa de Oportunidades',
  assetUrl: 'https://example.com/mapa.pdf',
  deliveryMessage: 'Aqui está o mapa.',
  instagramMediaId: null,
};

describe('findCampaignActivationBlockers', () => {
  test('returns no blockers for a fully ready campaign on an unpublished post', () => {
    expect(findCampaignActivationBlockers(readyCampaign, 'pending_approval')).toEqual([]);
  });

  test('blocks when there is no keyword', () => {
    expect(findCampaignActivationBlockers({ ...readyCampaign, keyword: '  ' }, 'scheduled')).toContain(
      'A campanha não tem palavra-chave.',
    );
  });

  test('blocks when there is no asset name', () => {
    expect(findCampaignActivationBlockers({ ...readyCampaign, assetName: '' }, 'scheduled')).toContain(
      'A campanha não tem material definido.',
    );
  });

  test('blocks when the asset URL is invalid', () => {
    expect(findCampaignActivationBlockers({ ...readyCampaign, assetUrl: 'not-a-url' }, 'scheduled')).toContain(
      'A URL do material não é válida.',
    );
  });

  test('blocks when there is no delivery message', () => {
    expect(findCampaignActivationBlockers({ ...readyCampaign, deliveryMessage: '' }, 'scheduled')).toContain(
      'A campanha não tem mensagem de entrega.',
    );
  });

  test('blocks when the post is already published but the campaign has no instagramMediaId', () => {
    const blockers = findCampaignActivationBlockers(readyCampaign, 'published');
    expect(blockers).toContain(
      'O post já foi publicado, mas a campanha não está vinculada ao ID da mídia no Instagram.',
    );
  });

  test('does not require instagramMediaId when the post is not published yet', () => {
    const blockers = findCampaignActivationBlockers(readyCampaign, 'scheduled');
    expect(blockers).toEqual([]);
  });

  test('does not block a published post that already has instagramMediaId', () => {
    const blockers = findCampaignActivationBlockers({ ...readyCampaign, instagramMediaId: 'media-1' }, 'published');
    expect(blockers).toEqual([]);
  });
});
