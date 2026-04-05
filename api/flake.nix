{
  description = "MeTTa-KG API - Rust development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Rust toolchain
            (rust-bin.stable.latest.default.override {
              extensions = [ "rust-src" ];
            })
            cargo
            rustc

            # System dependencies
            pkg-config
            openssl
            postgresql
            libpq

            # Development tools
            diesel-cli
            git
          ];

          shellHook = ''
            echo "MeTTa-KG API development environment loaded"
            export RUST_BACKTRACE=1
          '';

          env = {
            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
              pkgs.openssl
              pkgs.libpq
            ];
            LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
          };
        };
      }
    );
}
