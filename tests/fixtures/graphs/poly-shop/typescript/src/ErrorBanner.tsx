import { Badge } from './Badge';
import { fail } from './report';

export function ErrorBanner(props: { message: string }) {
	if (!props.message) fail('no message');
	return (
		<div>
			<Badge label={props.message} />
		</div>
	);
}
