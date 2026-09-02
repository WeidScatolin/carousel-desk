import { describe, test, expect, vi } from 'vitest';

vi.mock('./themes', () => ({ listThemesByStatus: vi.fn() }));
vi.mock('./posts', () => ({ listPostsByStatus: vi.fn() }));

import { listThemesByStatus } from './themes';
import { listPostsByStatus } from './posts';
import { getKanbanBoard } from './kanban';

describe('getKanbanBoard', () => {
  test('queries every column status and assembles the board', async () => {
    vi.mocked(listThemesByStatus).mockImplementation(async (status) =>
      status === 'pending' ? [{ id: 'theme-1' } as never] : [{ id: 'theme-2' } as never]
    );
    vi.mocked(listPostsByStatus).mockImplementation(async (status) => [{ id: `post-${status}` } as never]);

    const board = await getKanbanBoard();

    expect(listThemesByStatus).toHaveBeenCalledWith('pending');
    expect(listThemesByStatus).toHaveBeenCalledWith('rejected');
    expect(board.suggested).toEqual([{ id: 'theme-1' }]);
    expect(board.rejectedThemes).toEqual([{ id: 'theme-2' }]);
    expect(board.generating).toEqual([{ id: 'post-generating' }]);
    expect(board.pendingApproval).toEqual([{ id: 'post-pending_approval' }]);
    expect(board.scheduled).toEqual([{ id: 'post-scheduled' }]);
    expect(board.published).toEqual([{ id: 'post-published' }]);
    expect(board.rejectedPosts).toEqual([{ id: 'post-rejected' }]);
  });
});
