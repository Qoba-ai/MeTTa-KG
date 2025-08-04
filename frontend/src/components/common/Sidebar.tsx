import { createSignal, createContext, useContext, For } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRightToLine } from 'lucide-solid';
import { ModeToggle } from './modeToggle';

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

const SidebarHeader = () => {
	const { isOpen, setIsOpen }: any = useSidebar();

	return (
		<div class="flex items-center justify-between p-4">
			<span class={`${isOpen() ? "" : "hidden"} text-3xl font-bold text-[hsla(var(--secondary-foreground)/0.7)]`}>MeTTa-KG</span>
			<button onClick={() => setIsOpen(!isOpen())} class="text-white focus:outline-none">
				<ArrowRightToLine class={`text-[hsla(var(--secondary-foreground)/0.7)] transition-transform duration-300 ease-in-out ${isOpen() ? 'transform rotate-180' : ''}`} />
			</button>
		</div>
	);
};

const SidebarContent = ({ options }: any) => {
	const { isOpen }: any = useSidebar();

	return (
		<nav class="mt-4">
			<ul>
				<For each={options}>{(option) =>
					<>
						{option.separator && <hr class="my-2 border mx-2" />}
						<li>
							<A href={option.path} class="p-4 cursor-pointer text-sm flex items-center w-full">
								<span class="mr-2 text-[hsla(var(--secondary-foreground)/0.7)]">{option.icon}</span>
								<span class={`${isOpen() ? "" : "hidden"}`}>{option.name}</span>
							</A>
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

const SidebarComponent = ({ options }) => {
	const { isOpen } = useSidebar();

	return (
		<div class={`bg-secondary text-secondary-foreground h-screen ${isOpen() ? "w-64" : "w-16"} transition-all duration-300  flex flex-col justify-between`}>
			<div>
				<SidebarHeader />
				<SidebarContent options={options} />
			</div>
			<SidebarFooter />
		</div>
	);
};

export const Sidebar = ({ options }) => {
	return (
		<SidebarProvider>
			<SidebarComponent options={options} />
		</SidebarProvider>
	);
};
