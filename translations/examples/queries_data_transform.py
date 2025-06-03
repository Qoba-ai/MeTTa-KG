from client import MORK, ManagedMORK


def get_transform_rules(data_type):
    match data_type:
        case "data_users":
            pattern = ("(src (time_accessed $t (json $i ($k $v))))", "(src (time_accessed $t (json $i (user_id $id))))")
            template = ("(simple (time_accessed $t ((user $id) $k $v)))",)
        case "data_comments":
            pattern = ("(src (time_accessed $t (json $i ($k $v))))", "(src (time_accessed $t (json $i (comment_id $id))))")
            template = ("(simple (time_accessed $t ((comment $id) $k $v)))",)
        case "data_proposals":
            pattern = ("(src (time_accessed $t (json $i ($k $v))))", "(src (time_accessed $t (json $i (proposal_id $id))))")
            template = ("(simple (time_accessed $t ((proposal $id) $k $v)))", )
        case "data_comment_votes":  # 2 ids
            pattern = ("(src (time_accessed $t (json $i ($k $v))))", "(src (time_accessed $t (json $i (comment_id $id))))", "(src (time_accessed $t (json $i (voter_id $id2))))")
            template = ("(simple (time_accessed $t ((vote $id $id2) $k $v)))", )
        case "data_rounds":
            # ; --- ATTENTION the following works exactly because an atom containing a pool id looks like (json 1 (pool_id 0 (id 108)))
            # ; --- which is reduced to (json 1 (pool_id 0 108)), because id is also an identity function
            # ; --- TODO change id to a more suitable keyword
            pattern = ("(src (time_accessed $t (json $i (round_id $id))))",
                       "(src (time_accessed $t (json $i (pool_id $j $pool_id))))")
            template = ("(simple (time_accessed $t ((round $id) pool_id $pool_id)))",)
        case "data_reviews":    # cannot use review ids because not every review has an id
            pattern = ("(src (time_accessed $t (json $i ($k $v))))", )
            template = ("(simple (time_accessed $t ((review $i) $k $v)))", )
        case "data_milestones": # milestones don't have an id
            pattern = ("(src (time_accessed $t (json $i ($k $v))))", )
            template = ("(simple (time_accessed $t ((milestone $i) $k $v)))", )

        case _:
            raise NotImplementedError

    return pattern, template


def preprocessing(server, datasets=("data_users", "data_comments", "data_comment_votes", "data_reviews", "data_proposals", "data_rounds", "data_milestones")):
    with server.work_at("mettakg") as ins:
        for dataset in datasets:
            with ins.work_at(dataset) as scope:
                with scope.work_at("src") as src:
                    print("file://" + __file__.rpartition("/")[0] + f"/{dataset}.metta")
                    src.sexpr_import_("file://" + __file__.rpartition("/")[0] + f"/{dataset}.metta")\
                        .block()

                scope.transform(*get_transform_rules(dataset)).block()

    ins.sexpr_export("($dataset (simple $x))", "$x", "file://" + __file__.rpartition("/")[0] + "/transformed_all.metta")

    # for i, item in enumerate(ins.history):
    #     print("preprocessing event", i, str(item))

def _main():
    with ManagedMORK.start(binary_path="/home/anneline/PycharmProjects/MORK/target/release/mork_server").and_terminate() as server:
        preprocessing(server)


if __name__ == '__main__':
    _main()