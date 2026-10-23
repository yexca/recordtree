import { ActionIcon, Button, Tooltip } from '@mantine/core';
import { IconHeart, IconHeartFilled } from '@tabler/icons-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { ActorSummary } from '../api/types';
import { notifyError } from '../lib/notify';

/** Likes or unlikes an actor; reports the new state optimistically, then the saved one. */
export function useActorFavorite(actor: ActorSummary, onChange: (favorite: boolean) => void) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    const next = !actor.is_favorite;
    setBusy(true);
    onChange(next);
    try {
      const saved = await api.setActorFavorite(actor.id, next);
      onChange(saved.is_favorite);
    } catch (err) {
      onChange(!next);
      notifyError(next ? 'Could not add favorite' : 'Could not remove favorite', err);
    } finally {
      setBusy(false);
    }
  };
  return { busy, toggle };
}

export function FavoriteIcon({
  actor,
  onChange,
  className,
}: {
  actor: ActorSummary;
  onChange: (favorite: boolean) => void;
  className?: string;
}) {
  const { toggle } = useActorFavorite(actor, onChange);
  const label = actor.is_favorite ? `Remove ${actor.name} from favorites` : `Add ${actor.name} to favorites`;
  return (
    <Tooltip label={actor.is_favorite ? 'Favorited' : 'Add to favorites'} openDelay={400}>
      <ActionIcon
        className={className}
        variant="subtle"
        color={actor.is_favorite ? 'red' : 'gray'}
        aria-label={label}
        aria-pressed={actor.is_favorite}
        data-active={actor.is_favorite || undefined}
        onClick={() => void toggle()}
      >
        {actor.is_favorite ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}

export function FavoriteButton({ actor, onChange }: { actor: ActorSummary; onChange: (favorite: boolean) => void }) {
  const { busy, toggle } = useActorFavorite(actor, onChange);
  return (
    <Button
      variant={actor.is_favorite ? 'light' : 'default'}
      color={actor.is_favorite ? 'red' : undefined}
      leftSection={actor.is_favorite ? <IconHeartFilled size={16} /> : <IconHeart size={16} />}
      aria-pressed={actor.is_favorite}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {actor.is_favorite ? 'Favorited' : 'Favorite'}
    </Button>
  );
}
