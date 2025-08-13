import { createSignal, createContext, useContext, For } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRightToLine } from 'lucide-solid';
import { ModeToggle } from './modeToggle';
import { Separator } from "~/components/ui/separator"
import { Button } from "~/components/ui/button"

const SidebarContext = createContext();

export const useSidebar = () => useContext(SidebarContext);

const SidebarProvider = (props: any) => {
	const [isOpen, setIsOpen] = createSignal(true);
	const store = {
		isOpen,
		setIsOpen,
	};

	return (
		<SidebarContext.Provider value={store}>
			{props.children}
		</SidebarContext.Provider>
	);
};

const SidebarTrigger = () => {
	const { isOpen, setIsOpen }: any = useSidebar();

	return (
		<Button onClick={() => setIsOpen(!isOpen())} class="text-white focus:outline-none" variant="ghost">
			<ArrowRightToLine class={`text-[hsla(var(--secondary-foreground)/0.7)] transition-transform duration-800 ease-in-out ${isOpen() ? 'transform rotate-180' : ''}`} />
		</Button>
	)
}


const SidebarContent = ({ options }: any) => {
	const { isOpen }: any = useSidebar();

	return (
		<nav class="mt-4">
			<ul>
				<For each={options}>{(option) =>
					<>
						{option.separator && <Separator class="my-4" />}
						<li>
							<Button class="w-full h-full" variant="ghost">
								<A href={option.path} class={`cursor-pointer text-sm flex items-center ${isOpen() ? 'justify-start' : 'justify-center'} w-full h-full`}>
									<span class="mr-2 text-[hsla(var(--secondary-foreground)/0.7)]">{option.icon}</span>
									<span class={`${isOpen() ? "" : "hidden"} text-[12px]`}>{option.name}</span>
								</A>
							</Button>
						</li>
					</>
				}
				</For>
			</ul>
		</nav>
	);
};

const SidebarFooter = () => {
	return (
		<div class="mb-4 w-full flex justify-center items-center">
			<ModeToggle />
		</div>
	);
};

const SidebarComponent = ({ options }: any) => {
	const { isOpen }: any = useSidebar();

	return (
		<div class={`bg-secondary text-secondary-foreground ${isOpen() ? "w-64" : "w-16"} transition-all duration-300  flex flex-col justify-between relative`}>
			<div class="w-8 h-8 bg-secondary rounded-full flex items-center justify-center absolute -right-4 top-1/2 shadow-lg overflow-clip">
				<SidebarTrigger />
			</div>
			<div>
				<SidebarContent options={options} />
			</div>
			<SidebarFooter />
		</div>
	);
};

export const Sidebar = ({ options }: any) => {
	return (
		<SidebarProvider>
			<SidebarComponent options={options} />
		</SidebarProvider>
	);
};
