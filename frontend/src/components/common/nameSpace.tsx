import { For } from "solid-js"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator
} from "~/components/ui/breadcrumb"
import { namespace, setNamespace } from "~/lib/state"


export default function NameSpace(props: any) {
	return (
		<>
			<Breadcrumb>
				<BreadcrumbList>
					<For each={namespace()}>
						{(ns) => (
							<>
								<BreadcrumbItem>
									<button>
										<span>{ns}</span>
									</button>
								</BreadcrumbItem>
								<BreadcrumbSeparator />

							</>
						)}

					</For>
				</BreadcrumbList>
			</Breadcrumb>

		</>
	)
}
