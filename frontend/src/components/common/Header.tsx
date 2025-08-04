import { Show, type Component } from 'solid-js'
import { AiOutlineGithub } from 'solid-icons/ai'
import { A } from '@solidjs/router'
import styles from '../../Tokens.module.scss'
import { Button } from "~/components/ui/button"

export enum PageType {
	Editor,
	Token
}

export type HeaderProps = {
	currentPage: PageType
}


export function Header({ currentPage }: HeaderProps) {
	return (
		<>
			<header>
				<h1 class="">MeTTa KG</h1>
				<Button variant="destructive">bye</Button>
				<nav>
					<Show when={currentPage === PageType.Editor}>
						<A href="/tokens" class={styles.OutlineButton}>
							Token
						</A>
					</Show>
					<Show when={currentPage === PageType.Token}>
						<A href="/" class={styles.OutlineButton}>
							Editor
						</A>
					</Show>
					<a href="https://github.com/Qoba-ai/MeTTa-KG">
						<AiOutlineGithub class={styles.Icon} size={32} />
					</a>
				</nav>
			</header>
		</>
	)

}

